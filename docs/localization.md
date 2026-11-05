# Localization

The Container Tools extension (`extensions/vscode-containers`) can be shown in any language VS Code can be displayed in. Translations are plain JSON files that sit next to the English text. A string without a translation is shown in English, so a translation never has to be complete.

| Text | English | Translation into the language `<id>` |
|---|---|---|
| Declared in `package.json` (commands, views, settings, ...) | [`package.nls.json`](../extensions/vscode-containers/package.nls.json) | `package.nls.<id>.json` |
| In code, `vscode.l10n.t('...')` | `l10n/bundle.l10n.json` (generated) | `l10n/bundle.l10n.<id>.json` |

`<id>` is the lowercase VS Code display language, for example `zh-cn`. All paths on this page are relative to `extensions/vscode-containers`, and the `pnpm` commands are run from the repository root.

Included translations: `zh-cn` (Simplified Chinese, see [its conventions](#simplified-chinese-zh-cn)).

## Adding or changing a string

- **In code**, use `vscode.l10n.t('Removed {0} volume(s).', count)`. The extraction only sees string literals, so don't concatenate strings, use template literals, or pass a variable as the message. Write whole sentences, and don't build one out of parts such as a resource name, because the parts can't be translated in context. `{ message, comment: ['...'] }` gives translators a hint when a short string is ambiguous.
- **In `package.json`**, write `%some.key%` and add `"some.key": "English text"` to `package.nls.json`. The keys of `displayName` and `description` (`%displayName%`, `%description%`) may only contain letters, digits, `_` and `.`, because that's all `vsce` replaces with the English text when it builds the Marketplace listing.
- After changing a `vscode.l10n.t` string, run `pnpm --filter vscode-containers run l10n` and commit the updated `l10n/bundle.l10n.json`. The extraction covers the extension, the workspace packages it bundles (`packages/vscode-docker-registries`, ...), and the dependencies that ship their own `l10n/bundle.l10n.json`, like the `@microsoft/vscode-azext-*` libraries. Their code is bundled into the extension, and VS Code looks up its `vscode.l10n.t` calls in the extension's bundle, so updating those libraries can require running the command too. The lint step fails when the file is out of date.

Translations are keyed by the English text. When the English text changes, the old translation is no longer used (it's reported as stale) and the string appears in English until it is translated again. You don't need to touch the translations of other languages.

### The Compose language service

The Compose language service (`packages/compose-language-service`) is a separate process, and VS Code doesn't localize its text. It calls `l10n.t` from `@vscode/l10n` instead, with the translations that the extension sends in `initializationOptions.l10nBundle` (the value of `vscode.l10n.bundle`, which is `undefined` in English). They arrive after its modules are loaded, so text in module-level tables must be evaluated when it is requested: as a function for the hover texts, and as a getter for the completion items.

## Translating

To improve a translation, edit the values in its two files. To add a language, copy `package.nls.json` to `package.nls.<id>.json` and `l10n/bundle.l10n.json` to `l10n/bundle.l10n.<id>.json`, then translate the values. VS Code picks the files up by their name, with no registration needed.

Run `pnpm --filter vscode-containers run lint:l10n -- --verbose` to see what is still untranslated or stale. It also fails when a translation would break the UI, which you can't always see in the text:

- the `{0}`, `{1}`, ... placeholders must be the same as in the English (they can be reordered, and used fewer times when the English repeats one);
- `` `code` ``, URLs, `[text](command:...)` link targets and `$(icon)` names must be kept exactly;
- line breaks, and the spaces at the start or end of a string, must be kept.

To try a translation, install the language pack for it (for example *Chinese (Simplified) Language Pack for Visual Studio Code*), run **Configure Display Language** from the Command Palette, and start the extension with <kbd>F5</kbd>.

### What isn't localized (yet)

- The messages of the Dockerfile language server, a third-party package with hard-coded English messages and no translation support, and the diagnostics of the Compose language service, which come from the `yaml` library.
- `Error` messages of the libraries that don't depend on VS Code, `@microsoft/vscode-container-client` and `@microsoft/vscode-processutils`, which can't call `vscode.l10n.t`.
- The reasons given to `UserCancelledError`, because they are telemetry values, and `modelDescription`, which is written for language models.
- The `name` of the launch configuration snippets, which is written into the user's `launch.json`.

## Simplified Chinese (zh-cn)

Wording follows the VS Code Simplified Chinese language pack for editor concepts, and common Chinese Docker usage for container concepts (so *镜像* and *镜像仓库* rather than Microsoft's *映像* and *注册表*). The same English text must have the same Chinese in both files.

| English | 中文 | English | 中文 |
|---|---|---|---|
| container | 容器 | workspace | 工作区 |
| image / dangling image | 镜像 / 悬空镜像 | extension | 扩展 |
| volume | 卷 | setting | 设置 |
| network | 网络 | task | 任务 |
| (Docker) context | (Docker) 上下文 | debug | 调试 |
| registry | 镜像仓库 | terminal | 终端 |
| repository | 仓库 | walkthrough | 演练 |
| tag / to tag / untag | 标签 / 标记 / 取消标记 | sign in / sign out | 登录 / 注销 |
| digest | 摘要 | provider | 提供程序 |
| manifest | 清单 | filter | 筛选 |
| build | 构建 | learn more | 了解详细信息 |
| pull / push | 拉取 / 推送 | report issue | 报告问题 |
| run / run interactive | 运行 / 交互式运行 | remove, delete | 删除 |
| attach | 附加 | prune | 清理 |
| inspect | 检查 | container runtime | 容器运行时 |
| scaffolding | 脚手架 | orchestrator | 编排器 |

- Keep product names in English: Docker, Docker Hub, Docker Compose, Dockerfile, Podman, Azure Container Registry, GitHub Container Registry, Visual Studio Code, Container Tools, .NET, and so on. Keep Compose *profile* in English too.
- `Compose Up` and `Compose Down` name the `docker compose up` and `down` commands and stay in English. The other Compose commands are translated, for example `Compose 日志`.
- Use full-width punctuation (`，。：；！？`) in sentences. Put a space between Chinese characters and adjacent Latin letters, digits, `{0}` placeholders or `` `code` ``: `已删除 {0} 个容器`.
- In labels of the form `Prefix: Title`, which VS Code shows in the Command Palette, keep the ASCII `: `. Keep `...` as three ASCII dots, and drop the plural marker `(s)`.
- Quote names the user sees (a container name, an image tag) with “ ”, and keep ASCII quotes around code identifiers. Prefer rephrasing over *您*, and use *你* if a pronoun is needed.
