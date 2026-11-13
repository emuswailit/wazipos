// components/admin/departments/departmentsConfig.tsx
//
// How a department is shown in the admin list.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';
import type { DepartmentItem } from '@/databases/types';

const departmentTypeLabel = (t?: string | null) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : '');

export const departmentsConfig: AdminListConfig<DepartmentItem> = {
    title: 'Departments',
    noun: ['department', 'departments'],
    icon: 'business-outline',
    searchPlaceholder: 'Search departments…',
    addLabel: 'Add department',
    emptyMessage: 'Add the departments in your facility, e.g. Pharmacy, Laboratory, Wards.',
    keyOf: (d, i) => `${d.id || 'department'}-${i}`,
    titleOf: (d) => textOr(d.title, 'Untitled department'),
    subtitleOf: (d) => textOr(d.description, '') || null,
    avatarOf: (d) => ({ icon: 'business-outline', label: d.title }),
    badgesOf: (d) => (d.department_type ? [{ label: departmentTypeLabel(d.department_type), tone: 'info' }] : []),
    metaOf: (d) => (d.created ? formatDate(d.created) : null),
    primaryColumn: { label: 'Department', flex: 3 },
    columns: [
        { key: 'type', label: 'Type', flex: 1.4, render: (d) => textOr(departmentTypeLabel(d.department_type)) },
        { key: 'created', label: 'Created', flex: 1.1, render: (d) => formatDate(d.created) },
        { key: 'updated', label: 'Updated', flex: 1.1, render: (d) => formatDate(d.updated) },
    ],
};
