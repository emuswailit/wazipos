module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            // Change "nativewind/babel" to "nativewind" below:
            ["babel-preset-expo", { jsxImportSource: "nativewind" }],
        ],
        plugins: [
            "react-native-reanimated/plugin", // Must stay at the bottom of the list
        ],
    };
};
