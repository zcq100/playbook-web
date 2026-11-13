# Playbook UI

一个本地运行的 Ansible 仓库 Web 管理工具。通过浏览器管理多个仓库，按资产类型查看内容、编辑配置、阅读 Playbook 流程图，并执行自动化任务。

后端使用 Python 标准库和 PyYAML，前端使用原生 HTML、CSS 和 JavaScript。无需前端构建，不依赖外部 CDN。

## 主要功能

- **多工作空间**：分别保存仓库目录、默认执行参数，隔离文件操作和执行记录。
- **资产分类**：支持 Playbook、Role、Tasks、Handlers、变量、Inventory、模板、静态文件、依赖声明和配置文件。
- **类型专属视图**：流程卡片、角色文件树、变量结构、主机组关系、模板表达式和依赖表。
- **配置编辑器**：行号、缩进、修改对比、快捷保存、语法检查和文件修改冲突检测。
- **Playbook 流程图**：阶段折叠、节点参数、Play 定位、全屏查看和可拖拽的左右分栏。
- **任务执行**：配置 Inventory、主机限制、Tags、额外变量和 Check 模式，查看实时输出与退出状态。

## 环境要求

| 组件 | 要求 |
| --- | --- |
| Python | 3.10 或更高版本 |
| PyYAML | 通过 `requirements.txt` 安装 |
| 浏览器 | 支持现代 JavaScript、CSS Grid 和 Pointer Events |
| Ansible | 仅执行 Playbook 时需要，`ansible-playbook` 必须在服务进程的 `PATH` 中 |
| Node.js | 仅运行前端回归检查时需要，建议使用 22 或更高版本 |

浏览仓库、编辑文件和查看流程图不需要安装 Ansible。

## 快速开始

在项目根目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。首次启动展示 [`examples/`](examples/) 中的示例仓库，示例 Inventory 不包含真实主机。

如需通过页面执行 Playbook，可在启动服务的环境中安装 Ansible：

```bash
python -m pip install ansible-core
```

执行前仍需准备仓库依赖、SSH 密钥、目标主机权限和必要的 Ansible 配置。

使用其他端口：

```bash
python server.py --port 9000
```

在终端按 `Ctrl+C` 停止服务。修改后端 Python 代码后需要重启；服务不自动重载。修改前端文件后刷新页面即可。

## 工作空间

1. 点击侧栏空间名称旁的 `+`，填写名称和仓库在本机的目录。
2. 保存后进入新空间，自动扫描仓库资产。
3. 使用空间下拉菜单切换已有仓库。
4. 在「仓库设置」中修改当前空间，也可设置默认执行参数。

目录支持绝对路径和 `~`，属于**运行服务的计算机**。添加空间只记录已有目录，不克隆仓库或创建文件夹。

每个空间保存名称、目录，以及默认 Inventory、主机限制、Tags、JSON 额外变量和 Check 模式。旧版单目录设置自动迁移为默认空间。

空间定义保存在项目根目录的 `.settings.json`，该文件已加入 `.gitignore`。浏览器保存最近选择的空间和流程图分栏比例。执行历史与日志保存在服务内存中，重启后清空。

每个页面的文件和执行请求都指定所属空间。切换空间不影响已启动任务，每个空间同时允许一个任务，不同空间可以并行执行；空间有任务运行时不能修改其设置。

> 工作空间属于逻辑隔离，不提供用户权限或进程沙箱。两个空间如果指向同一个目录，会操作同一批真实文件。

## 资产类型

侧栏按「仓库、自动化、资源、配置」分组，支持按文件路径搜索。

| 资产 | 识别方式 | 查看内容 |
| --- | --- | --- |
| Playbooks | 根据 YAML 中的 Play 或 `import_playbook` 结构识别 | Play 流程、目标主机、角色、任务及流程图 |
| Roles | `roles/<角色名>/` 下的文件 | 按角色聚合、组件统计和文件树 |
| Tasks | `tasks/` 中的 YAML，或符合任务列表结构的独立 YAML | 任务名称、模块、条件、通知和参数 |
| Handlers | `handlers/` 中的 YAML、`handlers.yml` / `handlers.yaml`，或包含 `listen` 的任务列表 | 处理器名称、监听事件和任务配置 |
| Variables | `group_vars/`、`host_vars/`、`vars/`、`defaults/` | 作用域、嵌套键值和数据类型 |
| Inventory | `inventory/`、`inventories/` 或名为 `hosts` / `inventory` 的清单 | 主机组、主机声明、子组和组变量 |
| Templates | `templates/` 内的文件，以及 `.j2` 文件 | 原始模板、Jinja 输出表达式 |
| Files | `files/` 内的文件，支持任意扩展名 | 大小、角色归属、文本预览或文件信息 |
| 依赖声明 | `requirements.yml` / `requirements.yaml` | Role / Collection 名称、来源、SCM 和版本 |
| 配置文件 | 其他已识别的配置与 YAML 文件 | INI 配置节、JSON / YAML 结构及源码 |

Role 内的文件保留所属角色信息，也能从 Tasks、Handlers、Variables、Templates 等类型页面找到。例如，`roles/nginx/tasks/main.yml` 同时属于 nginx 角色和 Tasks 视图。

除 `files/`、`templates/` 外，扫描主要覆盖 `.yml`、`.yaml`、`.ini`、`.cfg`、`.j2`、`.json` 和无扩展名的 `hosts` / `inventory`。隐藏文件、隐藏目录和符号链接会被忽略，单次扫描最多返回 10,000 个文件。

### Playbook 识别

文件需要是非空 YAML 列表，其中每项为带非空 `hosts` 的 Play，或有效的 `import_playbook` 声明。同时检查 Play 级关键字和任务、角色列表的基本结构。

普通变量、任务片段、空文件和语法错误文件不会仅因扩展名是 YAML 就被列为 Playbook。超过 1 MB 的文件不识别为可执行 Playbook，执行接口也会重新检查当前文件。

这是保守的静态结构识别，不替代 Ansible 的完整语义、模块和依赖校验。

## 编辑配置

打开资产详情，切换到「配置编辑器」。仅 UTF-8 文本且大小不超过 1 MB 的文件支持编辑；二进制和超限文件仅显示文件信息。

| 操作 | 用法 |
| --- | --- |
| 保存 | 点击「保存配置」或按 `Ctrl+S` / `Cmd+S` |
| 缩进 | `Tab` 插入两个空格 |
| 查看修改 | 展开「查看修改」 |
| 放弃草稿 | 点击「撤销修改」 |

保存直接写回仓库文件，保留文本中的注释、格式、换行和原有文件权限，不将 YAML 重新序列化。

非模板 YAML / JSON 在保存前检查语法。Jinja 模板按文本处理，INI / CFG 不做完整语法校验；这些检查均不等同于 `ansible-playbook --syntax-check`。`!vault`、`!unsafe` 等标签可以解析展示，但不会解密 Vault 内容。

保存使用文件版本检查和同目录临时文件原子替换。检测到其他窗口或程序修改文件时，会拒绝覆盖并保留当前草稿。可先复制草稿，重新打开文件后合并。该检查不提供跨进程文件锁。

目前仅支持编辑现有资产，不创建、删除或重命名仓库文件。修改对比展示首尾相同行之间的替换区间，并非最小行差异。

## Playbook 流程图

打开 Playbook 详情，选择「流程图」，即可查看：

```text
Play
  → 事实收集（启用时）
  → pre_tasks
  → roles
  → tasks
  → post_tasks
  → Play 结束
```

图中还会标识通知处理器触发点、显式 `flush_handlers`、条件、循环，以及 `block / rescue / always`。导入 Playbook、任务文件和角色以引用节点展示，不展开被引用文件。

- 点击节点，在右侧查看完整配置。
- 使用顶部 Play 按钮快速定位。
- 超过 6 项的阶段默认折叠，可单独展开或统一展开、收起。
- 可隐藏 Handler 触发点、收起参数面板或切换到全屏布局。
- 拖动中间分隔条调整两侧宽度，浏览器会记住比例。

分隔条支持键盘操作：左右方向键每次调整 10px，按住 `Shift` 调整 40px，`Home` / `End` 调到边界。双击或聚焦后按 `Enter` 恢复默认。两侧最小宽度为 280px；小屏幕改为上下布局，不显示分隔条。

流程图展示**上次保存的文件结构**，不模拟实际执行结果，也不连接主机或计算 Jinja 表达式。Handler 的虚线标记仅表示可能处理已通知的处理器，实际执行取决于通知、失败状态及 Ansible 配置。

## 执行 Playbook

1. 打开已识别的 Playbook，点击「执行 Playbook」。
2. 检查 Inventory、主机限制、Tags 和额外变量。
3. 选择是否使用 Check 模式，点击「开始执行」。
4. 在「执行记录」中查看输出、任务状态和退出码。

| 参数 | 说明 |
| --- | --- |
| Inventory | 仓库内已有文件或目录，留空时由 Ansible 的默认配置决定 |
| 主机限制 | 对应 `--limit` |
| Tags | 对应 `--tags`，支持逗号分隔 |
| 额外变量 | JSON 对象，对应 `--extra-vars` |
| Check 模式 | 启用 `--check --diff`，默认勾选，可在空间设置中修改 |

关闭 Check 模式会实际执行任务。Check 模式也依赖模块支持，不能保证所有任务都能完整预检。

任务在所属仓库目录中，以启动 Web 服务的系统用户运行。服务使用参数数组调用 `ansible-playbook`，不经过 shell；但仓库中的任务本身仍可能执行命令或修改目标主机。

Role、Tasks 和 Handlers 通过 Playbook 引用执行，不提供独立执行入口。依赖页面只展示声明，不自动安装角色或集合。

## 项目结构

```text
playbook-ui/
├── server.py           # 本地 HTTP 服务、资产接口与任务执行
├── assets.py           # 资产识别、解析、摘要和文件保存
├── workspaces.py       # 空间配置与旧设置迁移
├── requirements.txt    # Python 依赖
├── static/
│   ├── index.html      # 页面入口
│   ├── app.js          # 资产视图、编辑器与流程图交互
│   ├── style.css       # 基础样式
│   └── compact.css     # 紧凑布局与流程图样式
├── examples/           # 示例 Ansible 仓库
└── tests/              # 后端测试与前端回归检查
```

## 测试

在项目根目录、已安装 Python 依赖的环境中执行：

```bash
python -m unittest discover -s tests
node --check static/app.js
node tests/asset_views.cjs
node tests/startup.cjs
node tests/flow_split.cjs
```

后端测试覆盖分类识别、空间隔离、文件保存、冲突检测和执行参数。前端检查覆盖资产视图、页面启动、流程图和分隔条交互。

前端回归使用 Node.js 模拟 DOM；启动检查还读取实际后端返回的数据。它们不启动浏览器、不运行真实 Ansible 任务，也不替代视觉和端到端验证。

## 常见问题

**工作空间加载失败或提示接口版本不匹配**

停止旧服务，重新运行 `python server.py` 后刷新页面。请通过该服务提供的地址访问，不要直接打开 `static/index.html` 或使用纯静态文件服务器。

**提示 Ansible 未安装**

确认 `ansible-playbook` 在启动服务的同一环境中可用。若使用虚拟环境，先激活该环境，再安装 Ansible 和启动服务。

**仓库中有 YAML，但没有显示在 Playbooks**

检查内容是否为 Play 列表。任务片段、变量、依赖声明和普通配置会出现在对应分类；语法错误、超限或不符合识别规则的文件不会提供执行入口。

**找不到角色或集合**

确认运行环境已安装所需依赖，仓库的 `ansible.cfg`、`roles_path` 和集合搜索路径配置正确。依赖声明页面不会自动完成安装。

**文件保存发生冲突**

文件可能已被其他程序或标签页修改。当前草稿会保留；先复制需要的内容，再重新打开文件并合并。

## 当前使用范围

服务仅监听 `127.0.0.1`，没有用户认证和权限管理，适合个人在本机使用，不应直接对公网开放。

目前不提供交互式 SSH / sudo 密码输入、页面内 Vault 解密、动态 Inventory 的独立查询视图、定时任务、任务取消和执行历史持久化。变量视图不计算 Ansible 变量优先级，主机清单也不表示主机在线状态。执行 Playbook 时，Ansible 仍会按运行环境和 Inventory 配置加载所需插件。

## Docker 部署

发布镜像地址为 `ghcr.io/zcq100/playbook-web`，版本由 [`VERSION`](VERSION) 管理，变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。以下拉取命令需对应版本的发布工作流成功后才能使用。

### 使用已发布镜像

```bash
docker run -d --name playbook-web --init \
  -p 127.0.0.1:8765:8765 \
  -v playbook-data:/data \
  -v /path/to/ansible:/workspace/repository \
  ghcr.io/zcq100/playbook-web:v0.1.0
```

打开页面后，将工作空间目录设为 `/workspace/repository`。容器内无法直接访问未挂载的宿主机目录。数据卷 `/data` 保存工作空间定义，仓库挂载需要可写才能通过页面保存文件。

镜像内包含 Python 3.13、Ansible Core、SSH 客户端和 Git，默认以 UID/GID `1000:1000` 的 `app` 用户运行。请确保挂载仓库允许该用户读写；执行远程任务时另行提供所需的 SSH 密钥、known_hosts 和仓库依赖。例如，可按需将 SSH 目录只读挂载到 `/home/app/.ssh`。镜像不包含宿主机的凭据或个人设置。

若 GHCR 包保持私有，拉取前需使用有读取权限的账号登录 `ghcr.io`；工作流不会自动将包改为公开。

### 本地构建或 Compose

```bash
docker build -t playbook-web:v0.1.0 .
TEST_IMAGE=playbook-web:v0.1.0 bash scripts/container-smoke.sh
```

也可以使用 [`compose.yaml`](compose.yaml)：

```bash
ANSIBLE_REPOSITORY=/path/to/ansible docker compose up -d --build
```

容器内部监听 `0.0.0.0:8765`，示例仅向宿主机 `127.0.0.1` 发布端口。服务仍只接受 localhost / 127.0.0.1 的 Host 请求，不提供公网认证。容器健康检查使用 `/api/health`，不依赖仓库扫描或工作空间设置。

`PLAYBOOK_SETTINGS_FILE` 可以指定工作空间设置文件位置。容器默认 `/data/.settings.json`，本机运行默认仍为项目内 `.settings.json`。父目录需要存在且可写。

## CI 与版本发布

[`ci.yml`](.github/workflows/ci.yml) 在 main 推送、Pull Request 和 `v*` 标签推送时运行，也支持手动触发：

1. 在 Python 3.10、3.13、3.14 环境运行后端测试与前端检查。
2. 构建本机架构镜像，检查非 root 身份、Ansible、HTTP 接口、设置持久化及文件保存。
3. 仅对版本标签构建并发布 `linux/amd64`、`linux/arm64` 镜像到 GHCR。
4. 确认镜像 manifest 后创建 GitHub Release。

发布标签必须与 `VERSION` 一致。`v0.1.0` 对应镜像标签 `v0.1.0`、`0.1.0`、`0.1`、`latest` 和提交 SHA 标签。普通分支与 PR 只检查和构建，不推送镜像。

仓库必须启用 GitHub Actions，并允许工作流写入 Packages 和创建 Release；工作流使用自动提供的 `GITHUB_TOKEN`，无需在项目内保存 PAT。

后续发版时，修改 `VERSION`、Compose 版本和变更记录，提交后创建同名标签：

```bash
git tag -a v0.1.0 -m 'Release v0.1.0'
git push origin main
git push origin v0.1.0
```
