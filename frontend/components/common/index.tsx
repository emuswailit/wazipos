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

/* -------- Helpers -------- */
export {
    confirmDialog,
    ConfirmProvider,
    useConfirm
} from './confirmDialog';
export type { ConfirmDialogOptions } from './confirmDialog';

/* -------- Hooks -------- */
export { useFocusClear } from '@/hooks/useFocusClear';
