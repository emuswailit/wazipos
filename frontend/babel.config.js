module.exports = function (api) {
    // Re-evaluate when the build mode changes (development <-> production).
    api.cache.using(() => `${process.env.NODE_ENV}|${process.env.BABEL_ENV}`);
    // Production builds (EAS production profile, `expo export`): drop console.log /
    // info / debug so API responses and personal data never reach device logs.
    // console.warn and console.error stay for crash reports.
    const production = process.env.NODE_ENV === "production" || process.env.BABEL_ENV === "production";
    return {
        presets: [
            // Change "nativewind/babel" to "nativewind" below:
            ["babel-preset-expo", { jsxImportSource: "nativewind" }],
        ],
        plugins: [
            ...(production ? [["transform-remove-console", { exclude: ["error", "warn"] }]] : []),
            "react-native-reanimated/plugin", // Must stay at the bottom of the list
        ],
    };
};
