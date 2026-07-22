# Technical

## 1. 技术栈

- React 18 + TypeScript：录音流程、界面状态、参数控件与中英文文案。
- Three.js 0.185：透明圆角盒、弹性声音体、程序化盒面纹理、灯光与 Pointer 旋转交互。
- Web Audio API：录音解码、碰撞颗粒、五声音阶转调、短共鸣、反馈延迟、卷积混响、压缩与实时频谱。
- MediaRecorder / `getUserMedia`：采集最长 4 秒的麦克风声音。
- Less + Vite：响应式样式和工程化构建；`base: './'`，产物可部署在任意子路径。

## 2. 目录结构

- `src/BoingBox.tsx`：顶层状态机、录音/示例入口、动态转场、播放与三项参数 UI、轻量 zh/en 文案。
- `src/SoftBoxStage.tsx`：Three.js 场景、盒体拖动、7 颗声音体物理、碰撞检测、声谱/刻度贴图与响应式相机。
- `src/AudioEngine.ts`：音频图、示例 Buffer、录音解码、碰撞采样颗粒、共鸣和频谱读取。
- `src/boing-box.less`：视觉令牌、录音入口、底部仪器条、短屏/窄屏与降低动效规则。
- `src/main.tsx`：React 挂载入口。
- `doc/requirements.md` / `doc/visual.md`：玩法蓝图与视觉系统。
- `_qa/capture.mjs`：390 × 844 与 320 × 568 的入口/软盒自动截图和尺寸检查。

## 3. 核心模块

`BoingBox` 使用 `entry → entering → studio → leaving` 四态控制录音入口与 3D 舞台的连续切换。Pointer 按下请求麦克风并开始录音，松开/取消停止；380 ms 以下的误触不会生成作品。若首次系统授权期间用户已经松手，本次只记录授权成功并提示再次按住。录音停止后立即解码为 `AudioBuffer`，自动启动物理与声音；解码失败时回退到程序化示例。语言由 `game_locale` 或浏览器语言决定。

入口会检查 `document.permissionsPolicy` / `featurePolicy` 的 `microphone` 能力，把 Mini App 宿主阻止与用户拒绝分开反馈。游戏页面不能自行突破父容器策略：宿主 iframe 需要 `allow="microphone; autoplay"`，受限的 `Permissions-Policy` 响应头需要加入游戏 origin；iOS WKWebView 宿主还需声明麦克风用途并处理媒体采集授权。

`SoftBoxStage` 在盒体局部坐标内维护 7 组位置、速度、半径与撞击形变量。每帧把世界向下方向转换为盒体局部重力，执行边界反射和球体互斥；拖动直接改变盒体姿态，轻点为所有声音体注入冲量。碰撞回调同时驱动软体压扁、发光、盒体脉冲和 `AudioEngine.hit()`，保证声音与画面来自同一个事件。

`AudioEngine` 不循环叠播完整录音。每颗声音体持有稳定切片位置，碰撞时只播放 75–235 ms 的短颗粒，并按声音体编号映射到五声音阶。主输出经高低通、压缩、延迟与卷积混响后进入分析器；盒面短柱与刻度每帧读取真实输出频谱。

布局为响应式 DOM + WebGL 混合界面。ResizeObserver 同步渲染尺寸并根据舞台宽高比调整相机距离；390 × 844、320 × 568、桌面宽屏分别有内部重排规则，不依赖整页缩放。

## 4. 扩展点

- 改物理手感、声音体数量、材质或盒面图案：编辑 `src/SoftBoxStage.tsx`。
- 改音阶、颗粒长度、切片策略、滤波或空间效果：编辑 `src/AudioEngine.ts`。
- 改录音流程、参数名称、状态和双语文案：编辑 `src/BoingBox.tsx`。
- 改颜色、排版、控件、转场或窄屏适配：编辑 `src/boing-box.less` 并同步 `doc/visual.md`。
- 接入平台存档时，在 `BoingBox` 中持久化 `settings` 和最近状态；录音 Buffer 默认只保留在当前内存会话，不上传后端。
