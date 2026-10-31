# 新海天 · 天色微风

[打开互动展示](https://Nhckdvrl.github.io/sora/)

纯浏览器运行的 StandRig 角色展示，包含 17 种互动、12 种表情、独立眼神跟随、三束头发物理、双臂动作、挥手、击掌及害羞回应。触碰胸前衣襟或腰侧会脸红，碰嘴会轻闭双眼，再自然恢复。

## 本地开发

需要 Node.js 22.12+ 或 24+。

```sh
npm ci
npm run build
npm run preview
```

打开终端显示的本地地址。日常改页面可以使用 `npm run dev`。模型和贴图来自 `public/model/sora-v0.3.1.json`，不依赖本地建模服务。模型导出使用已下载的原始数据，PNG 与 8 秒无音轨 WebM 在浏览器生成。

## 发布与更新

仓库的 Settings → Pages → Build and deployment → Source 设为 **GitHub Actions**。推送 `main` 后，工作流自动安装依赖、运行互动测试、构建静态页面并部署。也可在 Actions 中手动运行 `Publish Sora to GitHub Pages`。

构建结果为 `dist/`，资源使用相对路径，支持 GitHub Pages 的 `/sora/` 子目录。只将 `dist/` 发布为网站。

网站源码位于 `src/`；本地维护的 StandRig 浏览器引擎源码位于 `packages/core` 和 `packages/runtime`。`npm run build` 会先构建引擎。模型使用已有的小拇指修复版本 v0.3.1，未改变绑定或动作范围。

Space 暂停，1–9 切换表情，F 全屏。角色手掌单击击掌、双击挥手，右侧按钮也可触发互动。尊重系统减少动态效果的偏好。

## 来源与许可

角色新海天及原作素材属于原权利方。本项目为非官方爱好者互动展示，与原作官方无关联；角色画稿不因本仓库发布而重新授予开源许可。

StandRig 引擎来自 [sayaka-aiart/StandRig](https://github.com/sayaka-aiart/StandRig)，基线提交 `6938a2d3be4a11ea288cfdbdfd3ca9a41407821b`，采用 Apache-2.0，许可保留在 `LICENSE`。角色原作像素、补绘发束与局部隐藏底稿的来源说明保留在模型元数据。第三方依赖保留各自许可，见 `THIRD_PARTY_NOTICES.md`。
