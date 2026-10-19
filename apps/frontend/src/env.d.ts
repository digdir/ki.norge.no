declare namespace App {
  interface Locals {
    /** Set by middleware after the preview secret has been checked. */
    isPreview: boolean;
  }
}
