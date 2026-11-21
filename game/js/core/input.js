// Keyboard, mouse and pointer lock. Gameplay reads `down`, `pressed` (edge this frame) and mouse deltas.
// Synthetic input from the automated playtest goes through the same paths (real DOM events).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = 0; // bit 0 left, bit 2 right
    this.clicked = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.locked = false;
    this.wantLock = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.listeners = [];

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F3') e.preventDefault();
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
      for (const fn of this.listeners) fn(e.code);
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.locked || this.freeLook) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.clicked |= 1 << e.button;
      if (this.wantLock && !this.locked) this.requestLock();
    });
    addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    // When pointer lock is unavailable (automation, iframes), mouse movement still steers the camera.
    this.freeLook = false;
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock refused: free-look fallback */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onKey(fn) {
    this.listeners.push(fn);
  }

  isDown(code) {
    return this.down.has(code);
  }

  pressed(code) {
    return this.pressedSet.has(code);
  }

  get leftDown() {
    return (this.buttons & 1) !== 0;
  }

  get rightDown() {
    return (this.buttons & 4) !== 0;
  }

  leftClicked() {
    return (this.clicked & 1) !== 0;
  }

  /** Axis from two keys: -1, 0 or 1. */
  axis(neg, pos) {
    return (this.down.has(pos) ? 1 : 0) - (this.down.has(neg) ? 1 : 0);
  }

  /** Consume mouse look this frame, scaled by sensitivity and inversion. */
  look() {
    const k = 0.0022 * this.sensitivity;
    const dx = this.mouseDX * k;
    const dy = this.mouseDY * k * (this.invertY ? -1 : 1);
    this.mouseDX = this.mouseDY = 0;
    return [dx, dy];
  }

  /** Called once at the end of each frame. */
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.clicked = 0;
    this.wheel = 0;
  }
}
