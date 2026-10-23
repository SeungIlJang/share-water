package com.sharewater.app;

import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.lifecycle.Lifecycle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.naver.maps.map.NaverMap;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Real multi-pointer input through the Activity, not a programmatic camera rotation. */
@RunWith(AndroidJUnit4.class)
public class NativeMapGestureTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;

    @Test public void twoFingerRotationWebControlsResizeAndLongPress() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(instance -> activity=instance);
            long deadline=SystemClock.uptimeMillis()+60000;
            while(SystemClock.uptimeMillis()<deadline) {
                AtomicReference<Boolean> ready=new AtomicReference<>(false);
                instrumentation.runOnMainSync(() -> ready.set(activity.getNativeMapPlugin()!=null && activity.getNativeMapPlugin().currentMap()!=null));
                if(ready.get())break;
                SystemClock.sleep(250);
            }
            assertNotNull("Native map did not initialize", activity.getNativeMapPlugin().currentMap());
            waitForRendering();
            saveScreenshot("native-proof-before.png");
            AtomicReference<float[]> center=new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                int[] origin=new int[2]; activity.getNativeMapPlugin().currentMapView().getLocationOnScreen(origin);
                center.set(new float[]{origin[0]+activity.getNativeMapPlugin().currentMapView().getWidth()/2f,
                    origin[1]+activity.getNativeMapPlugin().currentMapView().getHeight()*.55f});
            });
            double before=bearing();
            rotate(center.get()[0],center.get()[1],100,75);
            SystemClock.sleep(1200);
            double after=bearing();
            double delta=Math.abs(((after-before+540)%360)-180);
            assertTrue("Real two-finger rotation must change bearing; before="+before+", after="+after,delta>20);
            saveScreenshot("native-proof-after.png");

            int[] angles={0,45,90,180};
            for(int i=0;i<angles.length;i++) {
                tapWebControl(".proof-row button:nth-child("+(i+1)+")");
                SystemClock.sleep(500);
                double difference=Math.abs(((bearing()-angles[i]+540)%360)-180);
                assertTrue("Web angle control must update native camera: "+angles[i],difference<2);
                long uiDeadline=SystemClock.uptimeMillis()+10000;
                String uiBearing="document.querySelector('.proof-status span').textContent.trim().endsWith('"+angles[i]+"°')";
                while(!Boolean.parseBoolean(js(uiBearing)) && SystemClock.uptimeMillis()<uiDeadline)SystemClock.sleep(100);
                assertTrue("Vue bearing text must settle before capture",Boolean.parseBoolean(js(uiBearing)));
                waitForRendering();
                saveScreenshot("native-proof-bearing-"+angles[i]+".png");
            }
            tapWebControl(".proof-row + .proof-row button:first-child");
            SystemClock.sleep(500);
            saveScreenshot("native-proof-route.png");

            tapWebControl(".proof-compass");
            SystemClock.sleep(700);
            assertTrue("Web compass tap must reset native bearing",Math.min(bearing(),360-bearing())<2);
            double oldHeight=numberFromJs("document.querySelector('.proof-map').clientHeight");
            tapWebControl(".proof-handle");
            SystemClock.sleep(900);
            double newHeight=numberFromJs("document.querySelector('.proof-map').clientHeight");
            assertTrue("Panel collapse must enlarge map",newHeight>oldHeight+80);
            AtomicReference<Integer> mapHeight=new AtomicReference<>();
            instrumentation.runOnMainSync(() -> mapHeight.set(activity.getNativeMapPlugin().currentMapView().getHeight()));
            double density=numberFromJs("window.devicePixelRatio");
            assertTrue("Native map must fill new bounds",Math.abs(mapHeight.get()-newHeight*density)<5);
            saveScreenshot("native-proof-collapsed.png");

            tapWebControl(".proof-handle");
            SystemClock.sleep(500);
            float[] c=center.get();
            long down=SystemClock.uptimeMillis();
            send(down,MotionEvent.ACTION_DOWN,1,c[0],c[1],0,0);
            SystemClock.sleep(950);
            send(down,MotionEvent.ACTION_UP,1,c[0],c[1],0,0);
            SystemClock.sleep(500);
            assertTrue("Native long press must reach Vue",numberFromJs("document.querySelectorAll('.proof-picked').length")>0);

            double retainedBearing=bearing();
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.RESUMED);
            SystemClock.sleep(700);
            assertNotNull("Native view must survive foreground/background",activity.getNativeMapPlugin().currentMapView());
            assertEquals("Background/resume must retain camera",retainedBearing,bearing(),.1);
            saveScreenshot("native-proof-resumed.png");
        }
    }
    private double bearing() {
        AtomicReference<Double> value=new AtomicReference<>();
        instrumentation.runOnMainSync(() -> value.set(activity.getNativeMapPlugin().currentMap().getCameraPosition().bearing));
        return value.get();
    }
    private void waitForRendering() {
        long deadline=SystemClock.uptimeMillis()+60000;
        AtomicReference<Boolean> complete=new AtomicReference<>(false);
        while(SystemClock.uptimeMillis()<deadline) {
            instrumentation.runOnMainSync(() -> complete.set(activity.getNativeMapPlugin().currentMap().isLoaded()
                && activity.getNativeMapPlugin().currentMap().isFullyRendered()));
            if(complete.get())break;
            SystemClock.sleep(250);
        }
        assertTrue("Map SDK must finish loading/rendering before visual capture",complete.get());
    }
    private String js(String expression) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> value=new AtomicReference<>();
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(expression, result -> {value.set(result);done.countDown();}));
        assertTrue("WebView JS timed out",done.await(10,TimeUnit.SECONDS));return value.get();
    }
    private double numberFromJs(String expression) throws Exception { return Double.parseDouble(js(expression)); }
    private void tapWebControl(String selector) throws Exception {
        String result=js("JSON.stringify((()=>{const r=document.querySelector('"+selector+"').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dpr:devicePixelRatio}})())");
        JSONObject rect=new JSONObject((String)new JSONTokener(result).nextValue());
        int[] origin=new int[2];instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().getLocationOnScreen(origin));
        float x=(float)(rect.getDouble("x")*rect.getDouble("dpr"))+origin[0];
        float y=(float)(rect.getDouble("y")*rect.getDouble("dpr"))+origin[1];
        long down=SystemClock.uptimeMillis();send(down,MotionEvent.ACTION_DOWN,1,x,y,0,0);SystemClock.sleep(80);send(down,MotionEvent.ACTION_UP,1,x,y,0,0);
    }
    private void rotate(float x,float y,float radius,float degrees) {
        long down=SystemClock.uptimeMillis();
        send(down,MotionEvent.ACTION_DOWN,1,x,y,radius,0);
        send(down,MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,x,y,radius,0);
        for(int i=1;i<=24;i++){SystemClock.sleep(30);send(down,MotionEvent.ACTION_MOVE,2,x,y,radius,degrees*i/24);}
        send(down,MotionEvent.ACTION_POINTER_UP|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,x,y,radius,degrees);
        send(down,MotionEvent.ACTION_UP,1,x,y,radius,degrees);
    }
    private void send(long down,int action,int count,float x,float y,float radius,float angle) {
        MotionEvent.PointerProperties[] properties=new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coordinates=new MotionEvent.PointerCoords[count];
        for(int i=0;i<count;i++) {
            properties[i]=new MotionEvent.PointerProperties();properties[i].id=i;properties[i].toolType=MotionEvent.TOOL_TYPE_FINGER;
            coordinates[i]=new MotionEvent.PointerCoords();float sign=i==0?-1:1;
            coordinates[i].x=x+sign*radius*(float)Math.cos(Math.toRadians(angle));
            coordinates[i].y=y+sign*radius*(float)Math.sin(Math.toRadians(angle));
            coordinates[i].pressure=1;coordinates[i].size=1;
        }
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,count,properties,coordinates,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        instrumentation.sendPointerSync(event);event.recycle();
    }
    private void saveScreenshot(String name) throws Exception {
        Bitmap bitmap=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(bitmap);
        File file=new File(activity.getExternalFilesDir(null),name);
        try(FileOutputStream stream=new FileOutputStream(file)){bitmap.compress(Bitmap.CompressFormat.PNG,100,stream);}
        bitmap.recycle();
    }
}
