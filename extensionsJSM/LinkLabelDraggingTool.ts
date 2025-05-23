/*
 *  Copyright 1998-2025 by Northwoods Software Corporation. All Rights Reserved.
 */

/*
 * This is an extension and not part of the main GoJS library.
 * The source code for this is at extensionsJSM/LinkLabelDraggingTool.ts.
 * Note that the API for this class may change with any version, even point releases.
 * If you intend to use an extension in production, you should copy the code to your own source directory.
 * Extensions can be found in the GoJS kit under the extensions or extensionsJSM folders.
 * See the Extensions intro page (https://gojs.net/latest/intro/extensions.html) for more information.
 */

import * as go from 'gojs';

/**
 * The LinkLabelDraggingTool class lets the user move a label on a {@link go.Link}.
 *
 * This tool only works when the Link has a label
 * that is positioned at the {@link go.Link.midPoint} plus some offset.
 * It does not work for labels that have a particular {@link go.GraphObject.segmentIndex}.
 *
 * If you want to experiment with this extension, try the <a href="../../samples/LinkLabelDragging.html">Link Label Dragging</a> sample.
 * @category Tool Extension
 */
export class LinkLabelDraggingTool extends go.Tool {
  /**
   * The label being dragged.
   */
  label: go.GraphObject | null;
  private _offset: go.Point; // of the mouse relative to the center of the label object
  private _originalOffset: go.Point | null;

  /**
   * Constructs a LinkLabelDraggingTool and sets the name for the tool.
   */
  constructor(init?: Partial<LinkLabelDraggingTool>) {
    super();
    this.name = 'LinkLabelDragging';
    this.label = null;
    this._offset = new go.Point();
    this._originalOffset = null;
    if (init) Object.assign(this, init);
  }

  /**
   * From the GraphObject at the mouse point, search up the visual tree until we get to
   * an object that is a label of a Link.
   * @returns This returns null if no such label is at the mouse down point.
   */
  findLabel(): go.GraphObject | null {
    const diagram = this.diagram;
    const e = diagram.lastInput;
    let elt = diagram.findObjectAt(e.documentPoint, null, null);

    if (elt === null || !(elt.part instanceof go.Link)) return null;
    while (elt !== null && elt.panel !== elt.part) {
      elt = elt.panel;
    }
    // If it's at an arrowhead segment index, don't consider it a label:
    if (elt !== null && (elt.segmentIndex === 0 || elt.segmentIndex === -1)) return null;
    return elt;
  }

  /**
   * This tool can only start if the mouse has moved enough so that it is not a click,
   * and if the mouse down point is on a GraphObject "label" in a Link Panel,
   * as determined by {@link findLabel}.
   */
  override canStart(): boolean {
    if (!super.canStart()) return false;
    const diagram = this.diagram;
    // require left button & that it has moved far enough away from the mouse down point, so it isn't a click
    const e = diagram.lastInput;
    if (!e.left) return false;
    if (!this.isBeyondDragSize()) return false;

    return this.findLabel() !== null;
  }

  /**
   * Start a transaction, call {@link findLabel} and remember it as the "label" property,
   * and remember the original value for the label's {@link go.GraphObject.segmentOffset} property.
   */
  override doActivate(): void {
    this.startTransaction('Shifted Label');
    this.label = this.findLabel();
    if (this.label !== null) {
      // compute the offset of the mouse-down point relative to the center of the label
      this._offset = this.diagram.firstInput.documentPoint
        .copy()
        .subtract(this.label.getDocumentPoint(go.Spot.Center));
      this._originalOffset = this.label.segmentOffset.copy();
    }
    super.doActivate();
  }

  /**
   * Stop any ongoing transaction.
   */
  override doDeactivate(): void {
    super.doDeactivate();
    this.stopTransaction();
  }

  /**
   * Clear any reference to a label element.
   */
  override doStop(): void {
    this.label = null;
    super.doStop();
  }

  /**
   * Restore the label's original value for {@link go.GraphObject.segmentOffset}.
   */
  override doCancel(): void {
    if (this.label !== null && this._originalOffset !== null) {
      this.label.segmentOffset = this._originalOffset;
    }
    super.doCancel();
  }

  /**
   * During the drag, call {@link updateSegmentOffset} in order to set
   * the {@link go.GraphObject.segmentOffset} of the label.
   */
  override doMouseMove(): void {
    if (!this.isActive) return;
    this.updateSegmentOffset();
  }

  /**
   * At the end of the drag, update the segment offset of the label and finish the tool,
   * completing a transaction.
   */
  override doMouseUp(): void {
    if (!this.isActive) return;
    this.updateSegmentOffset();
    this.transactionResult = 'Shifted Label';
    this.stopTool();
  }

  /**
   * Save the label's {@link go.GraphObject.segmentOffset} as a rotated offset from the midpoint of the
   * Link that the label is in.
   */
  updateSegmentOffset(): void {
    const lab = this.label;
    if (lab === null) return;
    const link = lab.part;
    if (!(link instanceof go.Link)) return;

    const last = this.diagram.lastInput.documentPoint;
    const idx = lab.segmentIndex;
    const numpts = link.pointsCount;
    if (isNaN(idx) && link.path) {
      // handle fractions along the whole path
      const labpt = link.path.getDocumentPoint(
        link.geometry.getPointAlongPath(lab.segmentFraction)
      );
      const angle = link.geometry.getAngleAlongPath(lab.segmentFraction);
      const p = new go.Point(last.x - this._offset.x - labpt.x, last.y - this._offset.y - labpt.y);
      lab.segmentOffset = p.rotate(-angle);
    } else if (idx < -numpts || idx >= numpts) {
      // if the label is a "mid" label, assume it is positioned differently from a label at a particular segment
      const mid = link.midPoint;
      // need to rotate this point to account for the angle of the link segment at the mid-point
      const p = new go.Point(last.x - this._offset.x - mid.x, last.y - this._offset.y - mid.y);
      lab.segmentOffset = p.rotate(-link.midAngle);
    } else {
      // handle the label point being on a partiular segment with a given fraction
      const frac = lab.segmentFraction;
      let a: go.Point;
      let b: go.Point;
      if (idx >= 0) {
        // indexing forwards
        a = link.getPoint(idx);
        b = idx < numpts - 1 ? link.getPoint(idx + 1) : a;
      } else {
        // or backwards if segmentIndex is negative
        const i = numpts + idx;
        a = link.getPoint(i);
        b = i > 0 ? link.getPoint(i - 1) : a;
      }
      const labx = a.x + (b.x - a.x) * frac;
      const laby = a.y + (b.y - a.y) * frac;
      const p = new go.Point(last.x - this._offset.x - labx, last.y - this._offset.y - laby);
      const segangle = idx >= 0 ? a.directionPoint(b) : b.directionPoint(a);
      lab.segmentOffset = p.rotate(-segangle);
    }
  }
}
