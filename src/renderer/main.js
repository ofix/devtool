import { createApp } from 'vue'
import router from './router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './theme/Global.css'
import themePlugin from './theme/ThemePlugin';
import App from './App.vue'
import { removeVueDevtoolsContainers } from "./vite.remove.js";
// SVG 图标组件
import IconScreenshot from '@/icons/IconCapture.vue';
import IconRuler from '@/icons/IconScreenRuler.vue';
import IconVideoRecord from '@/icons/IconRecordVideo.vue';
import IconHexEditor from '@/icons/IconHexEditor.vue';
import IconUnitConvert from '@/icons/IconUnitConvert.vue';
import IconPostman from '@/icons/IconPostman.vue';
import IconSFTP from '@/icons/IconSFTP.vue';
import IconFileCompare from '@/icons/IconFileCompare.vue';
import IconDesktopTile from '@/icons/IconDesktopTile.vue';
import IconConsole from '@/icons/IconSSH.vue';

removeVueDevtoolsContainers();

const app = createApp(App)
// 注册SVG图标组件
app.component('IconScreenshot', IconScreenshot);
app.component('IconRuler', IconRuler);
app.component('IconVideoRecord', IconVideoRecord);
app.component('IconHexEditor', IconHexEditor);
app.component('IconUnitConvert', IconUnitConvert);
app.component('IconPostman', IconPostman);
app.component('IconSFTP', IconSFTP);
app.component('IconFileCompare', IconFileCompare);
app.component('IconDesktopTile', IconDesktopTile);
app.component('IconConsole', IconConsole);

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(themePlugin, { router });
app.mount('#app')
