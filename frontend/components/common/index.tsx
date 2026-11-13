// components/common/index.ts

/* -------- Form components -------- */
export { CustomTextField } from './CustomTextField';

export { DateField } from './DateField';

export {
    ProductPickerAutocomplete
} from './ProductPickerAutocomplete';

export { BarcodeScannerInput } from './BarcodeScannerInput';

export { SelectDropdown } from './SelectDropdown';
export type { SelectOption } from './SelectDropdown';

export { EntityAutocomplete } from './EntityAutocomplete';

export { EntitiesMultiselectPicker } from './EntitiesMultiselectPicker';
export type { EntityPickerOption } from './EntitiesMultiselectPicker';

export { PaymentMethodSelector } from './PaymentMethodSelector';

export { WholesaleInventoryPicker } from './WholesaleInventoryPicker';

/* -------- Discount form modals -------- */
export {
    WholesalerPriceDiscountFormModal
} from './WholesalerPriceDiscountFormModal';
export type { AttachedPriceDiscount } from './WholesalerPriceDiscountFormModal';

export {
    WholesalerQuantityDiscountFormModal
} from './WholesalerQuantityDiscountFormModal';
export type { AttachedQuantityDiscount } from './WholesalerQuantityDiscountFormModal';

/* -------- Image picker -------- */
// Core (no React) — platform adapters, types, FormData helper.
export { appendToFormData, isPendingUpload } from './imagePicker';
export type { ImageFieldValue } from './imagePicker';

// UI + Formik integration.
export { FormikImagePicker } from './ImagePickerField';

/* -------- Helpers -------- */

/* -------- Hooks -------- */
export { useFocusClear } from '@/hooks/useFocusClear';

