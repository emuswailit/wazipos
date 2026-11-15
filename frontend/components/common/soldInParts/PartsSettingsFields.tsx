// components/common/soldInParts/PartsSettingsFields.tsx
//
// "Sold in parts" settings inside a Formik form (product form, restaurant
// supplies): what one whole unit holds and the size of one part.
// Field names match utils/parts.ts partsInitialValues / partsPayload.

import { ChoiceChips, FormPanel, FormRow } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SwitchField } from '@/components/common/SwitchField';
import { MEASURE_OPTIONS, Measure, UNITS, plural } from '@/utils/parts';
import { useFormikContext } from 'formik';
import { Text } from 'react-native';
import { useListTokens } from '@/components/common/listScreen';

const decimal = (t: string) => t.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

export default function PartsSettingsFields({ unitWord = 'unit', hint }: { unitWord?: string; hint?: string }) {
    const f = useFormikContext<any>();
    const { theme } = useListTokens();
    const on = f.values.sold_in_parts === 'true';
    const measure = (f.values.measure || 'VOLUME') as Measure;
    const units = UNITS[measure].map((u) => ({ value: u.value, label: u.label }));

    const setMeasure = (m: Measure) => {
        f.setFieldValue('measure', m);
        const first = UNITS[m][0].value;
        if (!UNITS[m].some((u) => u.value === f.values.content_unit)) f.setFieldValue('content_unit', m === 'MASS' ? 'kg' : first);
        if (!UNITS[m].some((u) => u.value === f.values.part_unit)) f.setFieldValue('part_unit', first);
    };

    // Preview: "1 bottle = 30 tots"
    const factor = (u: string) => UNITS[measure].find((x) => x.value === u)?.factor ?? 1;
    const whole = Number(f.values.content_per_unit) * factor(f.values.content_unit);
    const part = Number(f.values.part_size) * factor(f.values.part_unit);
    const label = String(f.values.part_label || f.values.part_unit || 'part').trim();
    const per = whole > 0 && part > 0 ? +(whole / part).toFixed(2) : 0;

    return (
        <FormPanel tint={on ? '#0ea5e9' : undefined}>
            <SwitchField
                label="Also sold in parts"
                hint={hint ?? 'e.g. whisky by the tot, rice by the kg, eggs by the piece — whole units still sell as usual.'}
                row
                value={on}
                onChange={(v) => f.setFieldValue('sold_in_parts', v ? 'true' : 'false')}
            />
            {on ? (
                <>
                    <ChoiceChips label="Measured by" options={MEASURE_OPTIONS} value={measure} onChange={setMeasure} />
                    <FormRow>
                        <CustomTextField name="content_per_unit" label={`One whole ${unitWord} holds`} required placeholder={measure === 'VOLUME' ? '750' : measure === 'MASS' ? '50' : '30'} keyboardType="decimal-pad" transform={decimal} />
                        <ChoiceChips label="Unit" options={units} value={f.values.content_unit} onChange={(v) => f.setFieldValue('content_unit', v)} />
                    </FormRow>
                    <FormRow>
                        <CustomTextField name="part_size" label="One part is" required placeholder={measure === 'VOLUME' ? '25' : '1'} keyboardType="decimal-pad" transform={decimal} />
                        <ChoiceChips label="Unit" options={units} value={f.values.part_unit} onChange={(v) => f.setFieldValue('part_unit', v)} />
                    </FormRow>
                    <CustomTextField name="part_label" label="Call a part" placeholder={measure === 'VOLUME' ? 'tot' : measure === 'MASS' ? 'kg' : 'piece'} />
                    {per > 0 ? (
                        <Text style={{ color: per >= 1 ? theme.textMuted : '#ef4444', fontFamily: theme.font.medium, fontSize: 12 }}>
                            {per >= 1 ? `1 ${unitWord} = ${per} ${plural(label, per)}` : "A part can't be bigger than the whole unit"}
                        </Text>
                    ) : null}
                </>
            ) : null}
        </FormPanel>
    );
}
