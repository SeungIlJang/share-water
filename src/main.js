import './assets/main.css'
import { createNaverMap } from "vue3-naver-maps";

import { createApp } from 'vue'
import App from './App.vue'

createApp(App)
    .use(createNaverMap, {
        clientId: import.meta.env.VITE_NAVER_CLIENT_ID, // .env 의 VITE_NAVER_CLIENT_ID
        category: "ncp", // Optional
        subModules: [], // Optional
    })
    .mount("#app");

// 명시적으로 false로 끄지 않는 한 네이티브 앱에서 OTA 업데이트를 확인한다.
// 웹에서는 startLiveUpdate 내부의 플랫폼 검사에서 즉시 종료된다.
if (import.meta.env.VITE_LIVE_UPDATE_ENABLED !== 'false') {
    import('./services/liveUpdate.js').then(({ installLiveUpdateChecks }) => {
        installLiveUpdateChecks();
    });
}
