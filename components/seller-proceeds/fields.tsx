"use client";

/**
 * Shared form primitives, re-exported from the buying-power stage.
 *
 * FieldShell / NumberField / SelectField / SegmentedControl are generic —
 * they carry no buyer-specific logic — so the seller stage reuses them
 * instead of duplicating the code.
 */
export {
  FieldShell,
  NumberField,
  SelectField,
  SegmentedControl,
} from "../buying-power/fields";
