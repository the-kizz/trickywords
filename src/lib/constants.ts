/**
 * Minimum interactive target size in CSS px.
 *
 * Nielsen Norman Group recommends ~2cm x 2cm for children aged 5-7,
 * roughly four times the adult minimum, because fine motor control is
 * still developing. Never lower this.
 */
export const MIN_TARGET_PX = 76

/**
 * Minimum interactive target size for an **adult**, in CSS px.
 *
 * WCAG 2.2's Target Size (Minimum) floor. It applies only in the parent
 * area, which is the one part of this app a child never uses; anything
 * a child touches uses `MIN_TARGET_PX`, which is four times the area.
 *
 * It exists because the parent area was quietly below it: the
 * disclosure rows in `ChildProgress` were `MIN_TARGET_PX / 2` -- 38px,
 * derived from the child floor rather than from any guidance -- and its
 * starting-point checkboxes were 20x20.
 */
export const ADULT_TARGET_PX = 44

export const APP_NAME = 'Tricky Words'
