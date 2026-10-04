// components/common/index.ts

/* -------- Form components -------- */
export { CustomTextField } from './CustomTextField';
export type { CustomTextFieldProps } from './CustomTextField';

export { DateField } from './DateField';
export type { DateFieldProps } from './DateField';

export { SwitchField } from './SwitchField';
export type { SwitchFieldProps } from './SwitchField';

export {
    ProductPickerAutocomplete
} from './ProductPickerAutocomplete';
export type {
    ProductPickerAutocompleteProps
} from './ProductPickerAutocomplete';

export { BarcodeScannerInput } from './BarcodeScannerInput';
export type {
    BarcodeScannerInputProps
} from './BarcodeScannerInput';

export { SelectDropdown } from './SelectDropdown';
export type {
    SelectDropdownProps,
    SelectOption
} from './SelectDropdown';

export { EntityAutocomplete } from './EntityAutocomplete';
export type { EntityAutocompleteProps } from './EntityAutocomplete';

export { EntitiesMultiselectPicker } from './EntitiesMultiselectPicker';
export type {
    EntitiesMultiselectPickerProps,
    EntityPickerOption
} from './EntitiesMultiselectPicker';

export { PaymentMethodSelector } from './PaymentMethodSelector';
export type { PaymentMethodSelectorProps } from './PaymentMethodSelector';

export { WholesaleInventoryPicker } from './WholesaleInventoryPicker';
export type {
    WholesaleInventoryFieldMap,
    WholesaleInventoryPickerProps
} from './WholesaleInventoryPicker';

/* -------- Discount form modals -------- */
export {
    WholesalerPriceDiscountFormModal
} from './WholesalerPriceDiscountFormModal';
export type {
    AttachedPriceDiscount,
    PriceDiscountPayload,
    PriceDiscountRecord,
    PriceDiscountSubmitResult,
    WholesalerPriceDiscountFormModalProps
} from './WholesalerPriceDiscountFormModal';

export {
    WholesalerQuantityDiscountFormModal
} from './WholesalerQuantityDiscountFormModal';
export type {
    AttachedQuantityDiscount,
    QuantityDiscountPayload,
    QuantityDiscountRecord,
    QuantityDiscountSubmitResult,
    WholesalerQuantityDiscountFormModalProps
} from './WholesalerQuantityDiscountFormModal';

/* -------- Image picker -------- */
// Core (no React) — platform adapters, types, FormData helper.
export {
    appendToFormData,
    isPendingUpload,
    isPickedImage,
    pickImage,
    previewUri,
    releasePreview
} from './imagePicker';
export type {
    ImageFieldValue,
    PickedImage,
    PickImageOptions
} from './imagePicker';

// UI + Formik integration.
export {
    FormikImagePicker,
    ImagePickerField,
    useFormikImagePicker
} from './ImagePickerField';
export type {
    FormikImagePickerApi,
    FormikImagePickerProps,
    ImagePickerFieldProps
} from './ImagePickerField';

/* -------- Helpers -------- */
export {
    confirmDialog,
    ConfirmProvider,
    useConfirm
} from './confirmDialog';
export type { ConfirmDialogOptions } from './confirmDialog';

export { Badge } from "./Badge";
export { Button } from "./Button";
export { Card } from "./Card";
export { EmptyState } from "./EmptyState";
export { Modal } from "./Modal";
export { Screen } from "./Screen";

/* -------- Hooks -------- */
export { useFocusClear } from '@/hooks/useFocusClear';
