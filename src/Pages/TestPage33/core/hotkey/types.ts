/** 常用键盘键码 */
export type KeyCode =
    // 字母键
    | "KeyA" | "KeyB" | "KeyC" | "KeyD" | "KeyE" | "KeyF" | "KeyG"
    | "KeyH" | "KeyI" | "KeyJ" | "KeyK" | "KeyL" | "KeyM" | "KeyN"
    | "KeyO" | "KeyP" | "KeyQ" | "KeyR" | "KeyS" | "KeyT" | "KeyU"
    | "KeyV" | "KeyW" | "KeyX" | "KeyY" | "KeyZ"
    // 数字键
    | "Digit0" | "Digit1" | "Digit2" | "Digit3" | "Digit4"
    | "Digit5" | "Digit6" | "Digit7" | "Digit8" | "Digit9"
    // 功能键
    | "F1" | "F2" | "F3" | "F4" | "F5" | "F6"
    | "F7" | "F8" | "F9" | "F10" | "F11" | "F12"
    // 修饰键
    | "ShiftLeft" | "ShiftRight"
    | "ControlLeft" | "ControlRight"
    | "AltLeft" | "AltRight"
    | "MetaLeft" | "MetaRight"
    // 特殊键
    | "Space" | "Enter" | "Escape" | "Backspace" | "Tab" | "Delete"
    | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
    | "Home" | "End" | "PageUp" | "PageDown" | "Insert"
    // 符号键
    | "Minus" | "Equal" | "BracketLeft" | "BracketRight"
    | "Backslash" | "Semicolon" | "Quote" | "Backquote"
    | "Comma" | "Period" | "Slash";

/** 鼠标按钮: 0=左键, 1=中键, 2=右键 */
export type MouseButton = 0 | 1 | 2;
