/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Canvas theme -> Fluent theme.
//
// The Copilot canvas host publishes GitHub's design tokens as CSS variables on
// the document (verified from inside a live panel: --background-color-default is
// #0d1117 in dark mode, --font-mono is "Monaspace Neon", and the host sets
// data-color-mode). Fluent themes are plain objects, so the app's palette can be
// mapped straight onto Fluent's neutral slots and the UI stops looking like a
// generic Fluent app pasted into the panel.
//
// Every mapping falls back to Fluent's own value, so a token the host does not
// publish -- `--background-color-inset` is one -- degrades instead of breaking.

import { useEffect, useState } from "react";
import { webLightTheme, webDarkTheme } from "@fluentui/react-components";


/**
 * Whether the host is showing a dark theme.
 *
 * The published background colour is preferred over `data-color-mode` because
 * it is the thing actually being rendered: a host that swaps token values
 * without touching the attribute would otherwise get light colours overlaid on
 * Fluent's dark ramp, leaving every slot we do not map visibly wrong. The
 * attribute and the media query remain as fallbacks for when no tokens exist.
 */
function isDark() {
    const background = token("--background-color-default");
    const luminance = relativeLuminance(background);
    if (luminance !== null) return luminance < 0.5;

    const root = document.documentElement;
    const mode = (root.getAttribute("data-color-mode") ?? document.body.getAttribute("data-color-mode") ?? "").toLowerCase();
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Perceived lightness of a hex or rgb() colour, or null if unparseable. */
function relativeLuminance(value) {
    if (!value) return null;
    let r, g, b;
    const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
        [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    } else {
        const rgb = value.trim().match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        if (!rgb) return null;
        [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Read a host token, or null when it is absent or empty. */
function token(name) {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const value = (root.getPropertyValue(name) || body.getPropertyValue(name) || "").trim();
    return value && value !== "(unset)" ? value : null;
}

/** First present token from a preference list, else null. */
function first(...names) {
    for (const name of names) {
        const value = token(name);
        if (value) return value;
    }
    return null;
}

/**
 * Overlay the host's tokens onto a Fluent base theme.
 *
 * The host publishes ~330 resolved tokens. The ones that matter for looking
 * native are not just the page background but the `control-*` family, which is
 * what GitHub styles buttons, inputs and tabs with -- leaving those on Fluent's
 * defaults is what makes a canvas read as "a Fluent app pasted into Copilot"
 * even when the page background matches.
 *
 * Note the two different blues: `--text-color-link` (#4493f8) is for links,
 * `--background-color-accent-emphasis` (#1f6feb) is for filled controls and
 * selection indicators. Using the link blue for brand slots tints every button
 * slightly wrong.
 *
 * Every mapping falls back to Fluent's own value, so a token the host does not
 * publish -- `--background-color-inset` is one -- degrades instead of breaking.
 */
function applyHostTokens(base) {
    // Surfaces
    const bg = token("--background-color-default");
    const bgMuted = token("--background-color-muted");
    const ctlRest = token("--background-color-control-rest");
    const ctlHover = token("--background-color-control-hover");
    const ctlActive = token("--background-color-control-active");
    const ctlSelected = token("--background-color-control-selected");
    const ctlDisabled = token("--background-color-control-disabled");
    const ghostHover = token("--background-color-control-transparent-hover");
    const ghostActive = token("--background-color-control-transparent-active");
    const ghostSelected = token("--background-color-control-transparent-selected");

    // Text
    const text = token("--text-color-default");
    const textMuted = token("--text-color-muted");
    const onEmphasis = token("--text-color-on-emphasis");
    const link = token("--text-color-link");
    const linkHover = token("--text-color-button-outline-hover");

    // Strokes
    const border = token("--border-color-default");
    const borderMuted = token("--border-color-muted");
    const borderEmphasis = token("--border-color-emphasis");
    const borderCtl = token("--border-color-control-rest");
    const borderDisabled = token("--border-color-control-disabled");
    const focus = first("--color-focus-outline", "--outline-color-focus-default");

    // Accent -- the control blue, not the link blue.
    const accent = first("--background-color-accent-emphasis", "--background-color-control-checked-rest");
    const accentHover = token("--background-color-control-checked-hover");
    const accentActive = token("--background-color-control-checked-active");
    const accentText = token("--text-color-accent");
    const accentMuted = token("--background-color-accent-muted");

    // Status
    const success = token("--background-color-success-emphasis");
    const successText = token("--text-color-success");
    const successMuted = token("--background-color-success-muted");
    const danger = token("--background-color-danger-emphasis");
    const dangerText = token("--text-color-danger");
    const dangerMuted = token("--background-color-danger-muted");
    const warn = token("--background-color-attention-emphasis");
    const warnText = token("--text-color-attention");
    const warnMuted = token("--background-color-attention-muted");

    // Typography
    const fontSans = first("--font-sans", "--font-system");
    const fontMono = token("--font-mono");

    return {
        ...base,

        ...(bg && {
            colorNeutralBackground1: bg,
            colorNeutralBackground2: bgMuted ?? bg,
            colorNeutralBackground3: bgMuted ?? bg,
            colorNeutralBackground4: bgMuted ?? bg,
            colorNeutralBackground5: bgMuted ?? bg,
            colorNeutralBackground6: bgMuted ?? bg,
            colorNeutralBackgroundStatic: bgMuted ?? bg,
        }),
        ...(ctlHover && {
            colorNeutralBackground1Hover: ctlHover,
            colorNeutralBackground2Hover: ctlHover,
            colorNeutralBackground3Hover: ctlHover,
            colorNeutralBackground4Hover: ctlHover,
        }),
        ...(ctlActive && {
            colorNeutralBackground1Pressed: ctlActive,
            colorNeutralBackground2Pressed: ctlActive,
            colorNeutralBackground3Pressed: ctlActive,
        }),
        ...(ctlSelected && {
            colorNeutralBackground1Selected: ctlSelected,
            colorNeutralBackground2Selected: ctlSelected,
            colorNeutralBackground3Selected: ctlSelected,
        }),
        ...(ctlRest && {
            colorNeutralBackgroundInverted: ctlRest,
            colorBrandBackground2: ctlRest,
        }),
        ...(ctlDisabled && { colorNeutralBackgroundDisabled: ctlDisabled }),
        ...(ghostHover && { colorSubtleBackgroundHover: ghostHover }),
        ...(ghostActive && { colorSubtleBackgroundPressed: ghostActive }),
        ...(ghostSelected && { colorSubtleBackgroundSelected: ghostSelected }),

        ...(text && {
            colorNeutralForeground1: text,
            colorNeutralForeground1Hover: text,
            colorNeutralForeground1Pressed: text,
            colorNeutralForeground1Selected: text,
            colorNeutralForeground2: text,
            colorNeutralForeground2Hover: text,
            colorNeutralForeground2Pressed: text,
            colorNeutralForeground2Selected: text,
        }),
        ...(textMuted && {
            colorNeutralForeground3: textMuted,
            colorNeutralForeground4: textMuted,
        }),
        ...(onEmphasis && { colorNeutralForegroundOnBrand: onEmphasis }),
        ...(borderEmphasis && { colorNeutralForegroundDisabled: borderEmphasis }),

        ...(borderCtl && {
            colorNeutralStroke1: borderCtl,
            colorNeutralStrokeAccessible: borderCtl,
        }),
        ...(borderEmphasis && {
            colorNeutralStroke1Hover: borderEmphasis,
            colorNeutralStroke1Pressed: borderEmphasis,
            colorNeutralStrokeAccessibleHover: borderEmphasis,
            colorNeutralStrokeAccessiblePressed: borderEmphasis,
        }),
        ...(border && { colorNeutralStroke2: border }),
        ...(borderMuted && { colorNeutralStroke3: borderMuted }),
        ...(borderDisabled && { colorNeutralStrokeDisabled: borderDisabled }),
        ...(focus && { colorStrokeFocus2: focus }),

        ...(accent && {
            colorBrandBackground: accent,
            colorBrandBackgroundSelected: accentHover ?? accent,
            colorCompoundBrandBackground: accent,
            colorCompoundBrandStroke: accent,
            colorBrandStroke1: accent,
        }),
        ...(accentHover && {
            colorBrandBackgroundHover: accentHover,
            colorCompoundBrandBackgroundHover: accentHover,
            colorCompoundBrandStrokeHover: accentHover,
        }),
        ...(accentActive && {
            colorBrandBackgroundPressed: accentActive,
            colorCompoundBrandBackgroundPressed: accentActive,
            colorCompoundBrandStrokePressed: accentActive,
        }),
        ...(accentMuted && { colorBrandStroke2: accentMuted }),
        ...(accentText && {
            colorBrandForeground1: accentText,
            colorBrandForeground2: accentText,
            colorCompoundBrandForeground1: accentText,
            colorNeutralForeground2BrandHover: accentText,
            colorNeutralForeground2BrandSelected: accentText,
        }),
        ...(link && { colorBrandForegroundLink: link }),
        ...(linkHover && {
            colorBrandForegroundLinkHover: linkHover,
            colorBrandForegroundLinkPressed: linkHover,
            colorCompoundBrandForeground1Hover: linkHover,
            colorCompoundBrandForeground1Pressed: linkHover,
        }),

        ...(success && { colorPaletteGreenBackground3: success }),
        ...(successMuted && {
            colorPaletteGreenBackground1: successMuted,
            colorStatusSuccessBackground1: successMuted,
        }),
        ...(successText && {
            colorPaletteGreenForeground1: successText,
            colorPaletteGreenBorder2: successText,
            colorStatusSuccessForeground1: successText,
        }),
        ...(danger && { colorPaletteRedBackground3: danger }),
        ...(dangerMuted && {
            colorPaletteRedBackground1: dangerMuted,
            colorStatusDangerBackground1: dangerMuted,
        }),
        ...(dangerText && {
            colorPaletteRedForeground1: dangerText,
            colorPaletteRedBorder2: dangerText,
            colorStatusDangerForeground1: dangerText,
        }),
        ...(warn && { colorPaletteDarkOrangeBackground3: warn, colorPaletteYellowBackground3: warn }),
        ...(warnMuted && {
            colorPaletteYellowBackground1: warnMuted,
            colorStatusWarningBackground1: warnMuted,
        }),
        ...(warnText && {
            colorPaletteDarkOrangeForeground1: warnText,
            colorPaletteYellowForeground1: warnText,
            colorStatusWarningForeground1: warnText,
        }),

        ...(fontSans && { fontFamilyBase: fontSans, fontFamilyNumeric: fontSans }),
        ...(fontMono && { fontFamilyMonospace: fontMono }),

        // GitHub's control radius is 6px; Fluent's medium default is 4px.
        borderRadiusSmall: "4px",
        borderRadiusMedium: "6px",
        borderRadiusLarge: "8px",
        borderRadiusXLarge: "12px",
    };
}

/**
 * Tokens whose values are read to decide whether the host theme changed.
 *
 * A theme switch does not necessarily touch an attribute or add a stylesheet --
 * the host can simply rewrite these values in a sheet that is already on the
 * page -- so the values themselves are the only reliable signal.
 */
const SENTINELS = [
    "--background-color-default",
    "--background-color-control-rest",
    "--text-color-default",
    "--background-color-accent-emphasis",
    "--font-sans",
    // Syntax colours can change without the surface colours moving, and the
    // code viewer would otherwise keep the previous palette.
    "--syntax-color-bg",
    "--syntax-color-keyword",
];

/** Cheap fingerprint of the host palette, used to detect a theme switch. */
function hostSignature() {
    const cs = getComputedStyle(document.documentElement);
    let out = isDark() ? "d" : "l";
    for (const name of SENTINELS) out += `|${cs.getPropertyValue(name).trim()}`;
    return out;
}

/** Follows the host, so switching theme with the canvas open repaints it. */
export function useCanvasTheme() {
    const [theme, setTheme] = useState(() => applyHostTokens(isDark() ? webDarkTheme : webLightTheme));

    useEffect(() => {
        let signature = null;
        let frame = 0;

        const apply = () => {
            frame = 0;
            const next = applyHostTokens(isDark() ? webDarkTheme : webLightTheme);
            // Component-level overrides (button fills, display headings) are
            // written in CSS against the host's own tokens, which only exist
            // inside the real panel. Flagging their presence lets that sheet
            // stay inert in a plain browser instead of applying dark control
            // colours over a light Fluent fallback.
            document.documentElement.dataset.canvasHostTokens = token("--background-color-control-rest") ? "1" : "";
            const sig = hostSignature();
            if (sig === signature) return;
            signature = sig;
            setTheme(next);
            // Anything themed outside React's tree -- Monaco, xterm -- cannot
            // see this state change, so announce it. Cheaper than making every
            // such component poll the host itself.
            window.dispatchEvent(new CustomEvent("canvas-theme-changed"));
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

        apply();

        // Attribute and stylesheet mutations cover the common cases: the host
        // flipping data-color-mode, and the token sheet arriving after first
        // paint. `attributeFilter` is deliberately omitted -- a theme switch
        // can rewrite an inline `style` attribute instead of a data-* one.
        const observer = new MutationObserver(schedule);
        const attrs = { attributes: true };
        observer.observe(document.documentElement, attrs);
        observer.observe(document.body, attrs);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });

        // None of the above fires when the host rewrites token *values* in a
        // stylesheet that is already on the page, which is how a theme switch
        // can arrive. Comparing the resolved values is the only signal that
        // catches every case, so this polls for as long as the canvas is open
        // rather than stopping once the tokens first appear. Reading five
        // custom properties is cheap, and `apply` bails without re-rendering
        // when the fingerprint is unchanged.
        const timer = setInterval(schedule, 500);

        const media = window.matchMedia?.("(prefers-color-scheme: dark)");
        media?.addEventListener("change", schedule);
        return () => {
            observer.disconnect();
            clearInterval(timer);
            if (frame) cancelAnimationFrame(frame);
            media?.removeEventListener("change", schedule);
        };
    }, []);

    return theme;
}
