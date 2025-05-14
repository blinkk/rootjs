const TAG = 'SUP';

export class Superscript {
  private api: any;
  private button: HTMLButtonElement;
  private iconClasses: Record<string, string>;

  static get CSS() {
    return '';
  }

  static get shortcut() {
    return 'CMD+.';
  }

  constructor(options: any) {
    this.api = options.api;
    this.button = document.createElement('button');
    this.iconClasses = {
      base: this.api.styles.inlineToolButton,
      active: this.api.styles.inlineToolButtonActive,
    };
  }

  static get isInline() {
    return true;
  }

  render() {
    // Avoid a race condition where the component is destroyed before the
    // render() function is called.
    // https://github.com/blinkk/rootjs/issues/482
    if (!this.button) {
      return null;
    }
    this.button.type = 'button';
    this.button.classList.add(this.iconClasses.base);
    this.button.innerHTML = this.toolboxIcon;
    return this.button;
  }

  surround(range: Range) {
    if (!range) {
      return;
    }

    const termWrapper = this.api.selection.findParentTag(TAG, Superscript.CSS);

    if (termWrapper) {
      this.unwrap(termWrapper);
    } else {
      this.wrap(range);
    }
  }

  wrap(range: Range) {
    const supElement = document.createElement(TAG);
    supElement.appendChild(range.extractContents());
    range.insertNode(supElement);
    this.api.selection.expandToTag(supElement);
  }

  unwrap(termWrapper: HTMLElement) {
    this.api.selection.expandToTag(termWrapper);
    const sel = window.getSelection()!;
    const range = sel.getRangeAt(0);
    const unwrappedContent = range.extractContents();
    termWrapper.parentNode!.removeChild(termWrapper);
    range.insertNode(unwrappedContent);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  checkState() {
    const termTag = this.api.selection.findParentTag(TAG, Superscript.CSS);
    this.button.classList.toggle(this.iconClasses.active, !!termTag);
  }

  get toolboxIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="#2c3e50" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" style="stroke: none !important" /><path d="M5 7l8 10m-8 0l8 -10" /><path d="M21 11h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -2" /></svg>';
  }

  static get sanitize() {
    return {
      sup: {},
    };
  }
}

export default Superscript;
