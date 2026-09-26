// api/drugs/drugsApi.ts
//
// Generic transport for the /drugs/* endpoints.
//
// Each action is a thin pass-through to clientWithCache.post.
// No reshaping, no field access — the caller builds the full
// request envelope.
//
// Request payloads are discriminated unions keyed on `action`,
// so the compiler verifies the envelope shape at the call site.
//
// Return types are inferred from `clientWithCache.post`, which
// resolves to the client's own `ApiResponse<T, E>` union — do
// not redeclare that shape here.

import clientWithCache from "./clientWithCache";

/* =========================================================
 * Response body
 *
 * Shape of `data` for mutation actions. Not the full envelope —
 * the envelope comes from `clientWithCache`.
 * ======================================================= */

export interface ResponseBody {
    response_code?: string;
    response_message?: string;
    errors?: string[];
    [key: string]: any;
}

/* =========================================================
 * Detail shapes — one per domain
 * ======================================================= */

export interface CategoryDetails {
    title: string;
    description: string;
}

export interface DrugClassDetails {
    title: string;
    description: string;
    body_system?: string;
}

export interface DrugSubClassDetails {
    title: string;
    description: string;
    drug_class?: string;
}

export interface FormulationDetails {
    title: string;
    description: string;
}

export interface FrequencyDetails {
    title: string;
    description: string;
}

export interface GenericDetails {
    title: string;
    description: string;
}

export interface PreparationDetails {
    title: string;
    description: string;
}

export interface RouteDetails {
    title: string;
    description: string;
}

/* =========================================================
 * Request unions — discriminated on `action`
 * ======================================================= */

export type CategoriesRequest =
    | { action: "GetCategories" }
    | {
        action: "CreateCategory";
        category_details: CategoryDetails;
    }
    | {
        action: "UpdateCategory";
        category_details: CategoryDetails & {
            id: string;
        };
    };

export type DrugClassesRequest =
    | { action: "GetDrugClasses" }
    | {
        action: "CreateDrugClass";
        drug_class_details: DrugClassDetails;
    }
    | {
        action: "UpdateDrugClass";
        drug_class_details: DrugClassDetails & {
            id: string;
        };
    };

export type DrugSubClassesRequest =
    | { action: "GetDrugSubClasses" }
    | {
        action: "CreateDrugSubClass";
        drug_sub_class_details: DrugSubClassDetails;
    }
    | {
        action: "UpdateDrugSubClass";
        drug_sub_class_details: DrugSubClassDetails & {
            id: string;
        };
    };

export type FormulationsRequest =
    | { action: "GetFormulations" }
    | {
        action: "CreateFormulation";
        formulation_details: FormulationDetails;
    }
    | {
        action: "UpdateFormulation";
        formulation_details: FormulationDetails & {
            id: string;
        };
    };

export type FrequenciesRequest =
    | { action: "GetFrequencies" }
    | {
        action: "CreateFrequency";
        frequency_details: FrequencyDetails;
    }
    | {
        action: "UpdateFrequency";
        frequency_details: FrequencyDetails & {
            id: string;
        };
    };

export type GenericsRequest =
    | { action: "GetGenerics" }
    | {
        action: "CreateGeneric";
        generic_details: GenericDetails;
    }
    | {
        action: "UpdateGeneric";
        generic_details: GenericDetails & { id: string };
    };

export type PreparationsRequest =
    | { action: "GetPreparations" }
    | {
        action: "CreatePreparation";
        preparation_details: PreparationDetails;
    }
    | {
        action: "UpdatePreparation";
        preparation_details: PreparationDetails & {
            id: string;
        };
    };

export type RoutesRequest =
    | { action: "GetRoutes" }
    | {
        action: "CreateRoute";
        route_details: RouteDetails;
    }
    | {
        action: "UpdateRoute";
        route_details: RouteDetails & {
            id: string;
        };
    };

/* =========================================================
 * Transport functions
 *
 * Return types are inferred from `clientWithCache.post` — no
 * explicit annotation, so the client's own ApiResponse shape
 * flows through unchanged.
 * ======================================================= */

const categoriesAction = (data: CategoriesRequest) => {
    return clientWithCache.post("/drugs/categories", data);
};

const drugClassesAction = (data: DrugClassesRequest) => {
    return clientWithCache.post("/drugs/drugclasses", data);
};

const drugSubClassesAction = (data: DrugSubClassesRequest) => {
    return clientWithCache.post("/drugs/drugsubclasses", data);
};

const formulationsAction = (data: FormulationsRequest) => {
    return clientWithCache.post("/drugs/formulations", data);
};

const frequenciesAction = (data: FrequenciesRequest) => {
    return clientWithCache.post("/drugs/frequencies", data);
};

const genericsAction = (data: GenericsRequest) => {
    return clientWithCache.post("/drugs/generics", data);
};

const preparationsAction = (data: PreparationsRequest) => {
    return clientWithCache.post("/drugs/preparations", data);
};

const routesAction = (data: RoutesRequest) => {
    return clientWithCache.post("/drugs/routes", data);
};

/* =========================================================
 * Default export
 * ======================================================= */

const drugsApi = {
    categoriesAction,
    drugClassesAction,
    drugSubClassesAction,
    formulationsAction,
    frequenciesAction,
    genericsAction,
    preparationsAction,
    routesAction,
};

export default drugsApi;