基于 Electron + Vue3 + Element-plus + screenshot-desktop 实现截图功能
编码风格: vue文件采用setup风格,所有事件函数以on开头(比如 onButtonClicked), 函数采用function形式

功能列表
1. 截图全局快捷键(Ctrl+Shift+A)
用户按快捷键 Ctrl+Shirt+A 可以打开截图工具条 ScreenshotTool 窗口,
ScreenshotTool 是一个独立置顶窗口，通过IPC方式创建，如果已经显示，则不重复创建。
窗口的初次显示默认加载路由 #/screenshot/screenshot, 完成工具条的初始化(黑色半透明背景，前景色白色)
工具条包含以下SVG图标按钮，每个图标按钮实际大小48px*48px, 上下左右居中对齐，父容器64px*64px,
所有图标导入自@/components/icons独立vue文件:
a. 截图(DefaultScreenshot),单击此按钮，会弹出子菜单(活动窗口截图(WindowScreenshot)，长截图(LongScreenshot),滚动截图(ScrollScreenshot))
b. 线条(Line)，悬浮此按钮，会弹出子菜单(箭头(Arrow)，矩形(Rect),圆形(Circle),递增数字(IncrementNumber),圆角星形(RoundedStar))
c. 文字(Text)，悬浮此按钮，会弹出子菜单(支持用户选择，字体大小(FontSize)，字体家族(FontFamily)，字体颜色(FontColor))
d. 选择(Select)，单击此按钮，用户可以对已添加的线条和文字进行选中、移动和删除
e. 录制(Record)，悬浮此按钮，会弹出录制子菜单(支持录制窗口的选择，录制的开启和停止，录制时间进度显示)
f. 设置(Setting),单击此按钮，会弹出设置窗口
g. 取消(Cancel)，单击此按钮，取消此次截屏
h. 完成(Finish)，单击此按钮，完成此次截屏

按钮功能实现步骤
a. 截图(capture)
1.1 用户单击DefaultScreenshot按钮，桌面冻住，将electron main进程 screenshot-desktop 获取的内容显示在canvas画布中，画布大小和桌面分辨率应该一致，用户按住鼠标左键可以在画布中进行矩形拖放操作选择需要截取的内容，弹起鼠标左键后，用户结束选取。
b. 活动窗口截图(WindowScreenshot)
1.1 用户单击WindowScreenshot按钮，桌面冻住，IPC请求主线程获取当前桌面的显示内容(DesktopView)和所有的窗口列表(EnumWindowList)
1.2 将DesktopView返回的内容显示到和桌面分辨率大小一致的的Canvas画布上
1.3 用户移动鼠标，高亮鼠标位置所在的窗口，红色边框进行标识
1.4 用户单击鼠标左键，完成活动窗口画面的截取
1.5 用户可以进一步单击工具条其他按钮进行操作
c. 长截图(LongScreenshot)
1.1 用户单击WindowScreenshot按钮，桌面冻住，IPC请求主线程获取当前桌面的显示内容(DesktopView)和所有的窗口列表(EnumWindowList)
1.2 将DesktopView返回的内容显示到和桌面分辨率大小一致的的Canvas画布上
1.3 用户移动鼠标，高亮鼠标位置所在的窗口，红色边框进行标识
1.4 用户单击鼠标左键，完成活动窗口画面的截取
1.5 用户可以进一步单击工具条其他按钮进行操作
d. 滚动截图(ScrollScreenshot)
1.1 用户单击WindowScreenshot按钮，桌面冻住，IPC请求主线程获取当前桌面的显示内容(DesktopView)和所有的窗口列表(EnumWindowList)
1.2 将DesktopView返回的内容显示到和桌面分辨率大小一致的的Canvas画布上
1.3 用户移动鼠标，高亮鼠标位置所在的窗口，红色边框进行标识
1.4 用户单击鼠标左键，完成活动窗口画面的选择
1.5 用户滚动活动窗口，IPC请求主线程完成当前活动窗口画面的截取，
1.6 将每次滚动截取的窗口画面暂存到列表中(scrollScreenshotList)
1.7 用户结束滚动超过间隔阈值，结束滚动截图，IPC通知主进程(FinishScrollScreenshot),主进程将scrollScreenshotList中暂存的画面进行拼接，并去除重复的内容（请采用优化算法实现），拼接完成通过IPC传递给renderer进程
e.线条(Line)，箭头(Arrow)，矩形(Rect),圆形(Circle),递增数字(IncrementNumber),圆角星形(RoundedStar)
1.1 用户鼠标左键单击以上按钮，进入编辑模式
1.2 用户鼠标右键单击任意位置结束编辑模式
1.3 用户单击线条(Line)，箭头(Arrow)，矩形(Rect),圆形(Circle),递增数字(IncrementNumber),圆角星形(RoundedStar)按钮之外的按钮，也会结束编辑模式
1.4 单击线条(Line)，箭头(Arrow)，矩形(Rect),圆形(Circle)，用户可以选择线条的粗细(BorderWidth)、颜色(Color)、透明度(Opacity)
1.5 单击递增数字(IncrementNumber),用户可以选择背景色(BackgroundColor),透明度(Opacity),字体大小(FontSize)
1.6 单击圆角星形(RoundedStar)，用户可以选择背景色(BackgroundColor),前景色(ForegroundColor),透明度(Opacity)
f. 文字按钮
1.1 用户单击文字按钮可以在子菜单中选择字体大小(FontSize)，字体家族(FontFamily)，字体颜色(FontColor)
g. 选择(Select)
1.1 用户单击此按钮，用户可以对已添加的线条和文字进行选中、移动和删除,选中和移动只需要通过鼠标完成，删除需要单击Delete按键或者鼠标右键菜单完成删除操作

录制/设置功能暂不开放，按钮禁用为灰白色

其他注意事项:
1. 文字和图形标注功能，采用MarkManager类管理，按住Ctrl+Z撤销，Ctrl+R重做，Mac下是Command+Z 撤销，Ctrl+R重做;
2. Line,Arrow,Rect,Circle,IncrementNumber,RoundedStar,Text 应该基于Es6类继承实现,支持旋转和缩放
3. 以上实现步骤如果有不合理，可以改进的地方请按照最优实现完成
