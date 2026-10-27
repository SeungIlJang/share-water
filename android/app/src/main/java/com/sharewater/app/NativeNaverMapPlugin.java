package com.sharewater.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.RectF;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.naver.maps.geometry.LatLng;
import com.naver.maps.geometry.LatLngBounds;
import com.naver.maps.map.CameraPosition;
import com.naver.maps.map.CameraUpdate;
import com.naver.maps.map.MapView;
import com.naver.maps.map.NaverMap;
import com.naver.maps.map.NaverMapOptions;
import com.naver.maps.map.NaverMapSdk;
import com.naver.maps.map.overlay.Marker;
import com.naver.maps.map.overlay.OverlayImage;
import com.naver.maps.map.overlay.PolylineOverlay;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/** Native map stays behind a transparent WebView; Activity routes map-only gestures here. */
@CapacitorPlugin(name = "WaterNativeMap")
public class NativeNaverMapPlugin extends Plugin {
    private boolean cameraGesture = false;
    private FrameLayout host;
    private MapView mapView;
    private NaverMap map;
    private final Map<String, Marker> markers = new HashMap<>();
    private final Map<String, JSObject> markerData = new HashMap<>();
    private final List<RectF> excluded = new ArrayList<>();
    private final RectF cssBounds = new RectF();
    private PolylineOverlay route;
    private double viewportWidth = 390;
    private boolean routingTouch, started, resumed;
    private String selectedId;

    @Override public void load() { ((MainActivity)getActivity()).attachNativeMap(this); }
    NaverMap currentMap() { return map; }
    MapView currentMapView() { return mapView; }

    @PluginMethod public void create(PluginCall call) {
        String clientId = call.getString("clientId", "");
        if (clientId.isEmpty()) { call.reject("Native map client ID is missing"); return; }
        getActivity().runOnUiThread(() -> {
            try {
                disposeMap();
                NaverMapSdk sdk = NaverMapSdk.getInstance(getContext());
                sdk.setClient(new NaverMapSdk.NcpKeyClient(clientId));
                sdk.setOnAuthFailedListener(error -> {
                    JSObject result = new JSObject();
                    result.put("code", String.valueOf(error.getErrorCode()));
                    result.put("message", "네이버 모바일 지도 인증 설정을 확인해 주세요.");
                    notifyListeners("authError", result);
                });
                ViewGroup parent = (ViewGroup)getBridge().getWebView().getParent();
                host = new FrameLayout(getContext());
                parent.addView(host, 0, new ViewGroup.LayoutParams(-1, -1));
                mapView = new MapView(getContext(), new NaverMapOptions().useTextureView(true));
                host.addView(mapView, new FrameLayout.LayoutParams(1, 1));
                mapView.onCreate(null);
                mapView.onStart(); started = true;
                mapView.onResume(); resumed = true;
                getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
                readBounds(call.getObject("bounds"));
                readExcluded(call.getArray("excludedRects", new JSArray()));
                applyBounds();
                mapView.getMapAsync(readyMap -> {
                    map = readyMap;
                    map.getUiSettings().setRotateGesturesEnabled(true);
                    map.getUiSettings().setZoomGesturesEnabled(true);
                    map.getUiSettings().setTiltGesturesEnabled(false);
                    map.getUiSettings().setCompassEnabled(false);
                    map.getUiSettings().setZoomControlEnabled(false);
                    map.getUiSettings().setScaleBarEnabled(true);
                    map.getUiSettings().setLogoGravity(Gravity.BOTTOM | Gravity.START);
                    map.setCameraPosition(new CameraPosition(coordinate(call.getObject("center")),
                        number(call.getDouble("zoom"), 15), 0, number(call.getDouble("bearing"), 0)));
                    map.addOnCameraChangeListener((reason, animated) -> {
                        cameraGesture = reason == CameraUpdate.REASON_GESTURE;
                        notifyListeners("cameraMove", state());
                    });
                    map.addOnCameraIdleListener(() -> {
                        JSObject data = state(); data.put("gesture", cameraGesture);
                        cameraGesture = false;
                        notifyListeners("cameraIdle", data);
                    });
                    map.setOnMapClickListener((point, coord) -> notifyListeners("mapTap", location(coord)));
                    map.setOnMapLongClickListener((point, coord) -> notifyListeners("mapLongPress", location(coord)));
                    call.resolve(state());
                });
            } catch (Exception error) { disposeMap(); call.reject("Native map creation failed", error); }
        });
    }

    private static double number(Double value, double fallback) { return value == null ? fallback : value; }
    private static LatLng coordinate(JSObject value) {
        return value == null ? new LatLng(37.512, 127.074)
            : new LatLng(value.optDouble("latitude", 37.512), value.optDouble("longitude", 127.074));
    }
    private JSObject location(LatLng coordinate) {
        JSObject result = new JSObject(); result.put("latitude", coordinate.latitude); result.put("longitude", coordinate.longitude); return result;
    }
    private JSObject state() {
        if (map == null) return new JSObject().put("ready", false);
        CameraPosition camera = map.getCameraPosition();
        JSObject result = location(camera.target);
        result.put("ready", true); result.put("zoom", camera.zoom); result.put("bearing", camera.bearing);
        result.put("loaded", map.isLoaded()); result.put("fullyRendered", map.isFullyRendered());
        result.put("tilt", camera.tilt); result.put("markerCount", markers.size());
        if (selectedId != null && markers.containsKey(selectedId)) {
            PointF point = map.getProjection().toScreenLocation(markers.get(selectedId).getPosition());
            JSObject selected = new JSObject(); selected.put("id", selectedId);
            selected.put("x", point.x / scale() + cssBounds.left); selected.put("y", point.y / scale() + cssBounds.top);
            result.put("selected", selected);
        }
        return result;
    }
    private float scale() { return (float)(getBridge().getWebView().getWidth() / Math.max(1, viewportWidth)); }
    private void readBounds(JSObject bounds) {
        if (bounds == null) return;
        viewportWidth = bounds.optDouble("viewportWidth", 390);
        float x = (float)bounds.optDouble("x", 0), y = (float)bounds.optDouble("y", 0);
        cssBounds.set(x, y, x + (float)bounds.optDouble("width", 1), y + (float)bounds.optDouble("height", 1));
    }
    private void readExcluded(JSArray rectangles) {
        excluded.clear();
        for (int i=0; i<rectangles.length(); i++) {
            JSONObject rect = rectangles.optJSONObject(i); if (rect == null) continue;
            float x=(float)rect.optDouble("x"), y=(float)rect.optDouble("y");
            excluded.add(new RectF(x, y, x+(float)rect.optDouble("width"), y+(float)rect.optDouble("height")));
        }
    }
    private void applyBounds() {
        if (mapView == null) return;
        float density=scale();
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.max(1,Math.round(cssBounds.width()*density)),Math.max(1,Math.round(cssBounds.height()*density)));
        params.leftMargin=getBridge().getWebView().getLeft()+Math.round(cssBounds.left*density);
        params.topMargin=getBridge().getWebView().getTop()+Math.round(cssBounds.top*density);
        mapView.setLayoutParams(params);
    }
    public boolean dispatchNativeTouch(MotionEvent event) {
        if (map == null || mapView == null) return false;
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            int[] webOrigin=new int[2]; getBridge().getWebView().getLocationOnScreen(webOrigin);
            float x=(event.getRawX()-webOrigin[0])/scale(), y=(event.getRawY()-webOrigin[1])/scale();
            routingTouch=cssBounds.contains(x,y);
            for (RectF rect:excluded) if(rect.contains(x,y)) routingTouch=false;
        }
        if (!routingTouch) return false;
        int[] origin=new int[2]; mapView.getLocationOnScreen(origin);
        MotionEvent copy=MotionEvent.obtain(event);
        copy.offsetLocation(event.getRawX()-event.getX()-origin[0],event.getRawY()-event.getY()-origin[1]);
        mapView.dispatchTouchEvent(copy); copy.recycle();
        if(event.getActionMasked()==MotionEvent.ACTION_UP || event.getActionMasked()==MotionEvent.ACTION_CANCEL) routingTouch=false;
        return true;
    }

    @PluginMethod public void setBounds(PluginCall call) { getActivity().runOnUiThread(() -> {
        readBounds(call.getObject("bounds")); readExcluded(call.getArray("excludedRects",new JSArray())); applyBounds(); call.resolve();
    }); }
    @PluginMethod public void getState(PluginCall call) { getActivity().runOnUiThread(() -> call.resolve(state())); }
    @PluginMethod public void moveCamera(PluginCall call) { getActivity().runOnUiThread(() -> {
        if(map==null){call.reject("Map not ready");return;}
        CameraPosition current=map.getCameraPosition();
        JSObject center=call.getObject("center");
        map.moveCamera(CameraUpdate.toCameraPosition(new CameraPosition(center==null?current.target:coordinate(center),
            number(call.getDouble("zoom"),current.zoom),0,number(call.getDouble("bearing"),current.bearing))));
        call.resolve(state());
    }); }
    @PluginMethod public void fitBounds(PluginCall call) { getActivity().runOnUiThread(() -> {
        if(map==null){call.reject("Map not ready");return;}
        JSArray points=call.getArray("points",new JSArray());
        LatLngBounds.Builder bounds=new LatLngBounds.Builder();
        for(int i=0;i<points.length();i++){ JSONObject p=points.optJSONObject(i); if(p!=null)bounds.include(new LatLng(p.optDouble("latitude"),p.optDouble("longitude"))); }
        if(points.length()>1)map.moveCamera(CameraUpdate.fitBounds(bounds.build(),40));
        call.resolve();
    }); }

    @PluginMethod public void setMarkers(PluginCall call) { getActivity().runOnUiThread(() -> {
        if(map==null){call.reject("Map not ready");return;}
        for(Marker marker:markers.values())marker.setMap(null); markers.clear(); markerData.clear();
        JSArray items=call.getArray("markers",new JSArray()); selectedId=call.getString("selectedId");
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.optJSONObject(i); if(item==null)continue;
            String id=item.optString("id");
            Marker marker=new Marker();
            marker.setPosition(new LatLng(item.optDouble("latitude"),item.optDouble("longitude")));
            marker.setIcon(OverlayImage.fromBitmap(markerBitmap(id.equals(selectedId),item.optBoolean("approximate",false),item.optInt("order",0))));
            marker.setWidth(42); marker.setHeight(48); marker.setAnchor(new PointF(.5f,1));
            marker.setFlat(false); marker.setAngle(0);
            marker.setCaptionText(item.optString("title")); marker.setCaptionTextSize(11);
            marker.setCaptionMinZoom(15); marker.setZIndex(id.equals(selectedId)?300:100);
            marker.setOnClickListener(overlay -> { selectedId=id; JSObject data=state(); data.put("id",id); notifyListeners("markerTap",data); return true; });
            marker.setMap(map); markers.put(id,marker);
        }
        call.resolve(state());
    }); }
    private Bitmap markerBitmap(boolean selected,boolean approximate,int order) {
        Bitmap bitmap=Bitmap.createBitmap(96,112,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(bitmap); Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        Path drop=new Path(); drop.moveTo(48,108); drop.cubicTo(39,94,6,74,6,49); drop.cubicTo(6,-9,90,-9,90,49); drop.cubicTo(90,74,57,94,48,108);
        paint.setColor(selected?Color.rgb(216,246,250):Color.WHITE); canvas.drawPath(drop,paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(selected?7:4);paint.setColor(Color.rgb(10,147,162));canvas.drawPath(drop,paint);
        paint.setStyle(Paint.Style.FILL);paint.setColor(Color.rgb(10,174,205));
        Path water=new Path();water.moveTo(48,20);water.cubicTo(42,37,31,45,31,57);water.cubicTo(31,82,65,82,65,57);water.cubicTo(65,45,54,37,48,20);canvas.drawPath(water,paint);
        if(approximate){paint.setColor(Color.WHITE);canvas.drawCircle(48,51,26,paint);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(38);canvas.drawText("🏞️",48,66,paint);}
        if(order>0){paint.setColor(Color.rgb(239,63,67));canvas.drawCircle(75,20,17,paint);paint.setColor(Color.WHITE);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(24);paint.setFakeBoldText(true);canvas.drawText(String.valueOf(order),75,28,paint);}
        return bitmap;
    }
    @PluginMethod public void setRoute(PluginCall call) { getActivity().runOnUiThread(() -> {
        if(route!=null){route.setMap(null);route=null;}
        JSArray points=call.getArray("points",new JSArray());
        if(map!=null && points.length()>=2){
            List<LatLng> coords=new ArrayList<>();
            for(int i=0;i<points.length();i++){JSONObject p=points.optJSONObject(i);if(p!=null)coords.add(new LatLng(p.optDouble("latitude"),p.optDouble("longitude")));}
            route=new PolylineOverlay();route.setCoords(coords);route.setWidth(7);String color=call.getString("color","#087f8c");route.setColor(color.matches("#[0-9a-fA-F]{6}")?Color.parseColor(color):Color.rgb(8,127,140));route.setMap(map);
        }
        call.resolve();
    }); }
    @PluginMethod public void setUserLocation(PluginCall call) { getActivity().runOnUiThread(() -> {
        if(map!=null){map.getLocationOverlay().setPosition(coordinate(call.getObject("position")));map.getLocationOverlay().setVisible(true);}call.resolve();
    }); }
    @PluginMethod public void destroy(PluginCall call) { getActivity().runOnUiThread(() -> {disposeMap();call.resolve();}); }
    private void disposeMap() {
        routingTouch=false; markers.clear(); markerData.clear(); selectedId=null;
        if(route!=null){route.setMap(null);route=null;}
        if(mapView!=null){if(resumed)mapView.onPause();if(started)mapView.onStop();mapView.onDestroy();}
        if(host!=null && host.getParent()!=null)((ViewGroup)host.getParent()).removeView(host);
        resumed=false;started=false;map=null;mapView=null;host=null;
    }
    @Override protected void handleOnStart(){if(mapView!=null&&!started){mapView.onStart();started=true;}}
    @Override protected void handleOnResume(){if(mapView!=null&&!resumed){mapView.onResume();resumed=true;}}
    @Override protected void handleOnPause(){if(mapView!=null&&resumed){mapView.onPause();resumed=false;}}
    @Override protected void handleOnStop(){if(mapView!=null&&started){mapView.onStop();started=false;}}
    @Override protected void handleOnDestroy(){disposeMap();}
}
