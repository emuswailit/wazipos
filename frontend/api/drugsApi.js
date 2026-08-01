import clientWithCache from "./clientWithCache";

const bodySystemsAction = (data) => {
    return clientWithCache.post("/drugs/bodysystems", data);
};
const drugClassesAction = (data) => {
    return clientWithCache.post("/drugs/drugclasses", data);
};
const drugSubClassesAction = (data) => {
    return clientWithCache.post("/drugs/drugsubclasses", data);
};
const formulationsAction = (data) => {
    return clientWithCache.post("/drugs/formulations", data);
};
const frequenciesAction = (data) => {
    return clientWithCache.post("/drugs/frequencies", data);
};
const genericsAction = (data) => {
    return clientWithCache.post("/drugs/generics", data);
};
const preparationsAction = (data) => {
    return clientWithCache.post("/drugs/preparations", data);
};

export default {
    bodySystemsAction,
    drugClassesAction,
    drugSubClassesAction,
    formulationsAction,
    frequenciesAction,
    genericsAction,
    preparationsAction
};