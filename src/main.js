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

// 운영 웹 배포 주소가 준비된 뒤 환경변수로 명시적으로 켠 경우에만 자동 업데이트한다.
if (import.meta.env.VITE_LIVE_UPDATE_ENABLED === 'true') {
    import('./services/liveUpdate.js').then(({ startLiveUpdate }) => startLiveUpdate());
}
