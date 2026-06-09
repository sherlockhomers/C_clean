"""Capture CleanC UI screenshots for README."""
import ctypes
import time
from pathlib import Path

from PIL import ImageGrab

user32 = ctypes.windll.user32
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
SW_RESTORE = 9


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


def find_cleanc_hwnd():
    result = []

    def callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd) + 1
        buf = ctypes.create_unicode_buffer(length)
        user32.GetWindowTextW(hwnd, buf, length)
        title = buf.value
        if "CleanC" in title and "Cursor" not in title:
            result.append(hwnd)
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(WNDENUMPROC(callback), 0)
    return result[0] if result else None


def focus_window(hwnd):
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.6)


def get_window_rect(hwnd):
    rect = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    return rect.left, rect.top, rect.right, rect.bottom


def click(x, y):
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.25)
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.08)
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    time.sleep(1.0)


def capture_window(hwnd, out_path: Path):
    focus_window(hwnd)
    left, top, right, bottom = get_window_rect(hwnd)
    img = ImageGrab.grab(bbox=(left, top, right, bottom), all_screens=True)
    img.save(out_path, format="PNG")


def main():
    hwnd = find_cleanc_hwnd()
    if not hwnd:
        raise SystemExit("CleanC window not found")

    out_dir = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
    out_dir.mkdir(parents=True, exist_ok=True)

    focus_window(hwnd)
    left, top, _, _ = get_window_rect(hwnd)
    nav_x = left + 110
    # base_y aligned to「占用侦探」(3rd item); other items offset from here
    base_y = top + 130
    step = 46

    shots = [
        ("dashboard", -2 * step),
        ("detective", 0),
        ("software-migrate", 2 * step),
        ("ai-assistant", 4 * step),
    ]

    for name, offset in shots:
        click(nav_x, base_y + offset)
        focus_window(hwnd)
        out = out_dir / f"{name}.png"
        capture_window(hwnd, out)
        print(f"Saved {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
