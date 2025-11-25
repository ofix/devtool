import { createApp } from 'vue'
import router from './router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './theme/Global.css'
import themePlugin from './theme/ThemePlugin';
import App from './App.vue'


const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(themePlugin);
app.mount('#app')
