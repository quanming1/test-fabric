/**
 * 子项目库模式打包配置
 * 用于将子项目打包成独立组件库，供主项目引用
 * 
 * 使用方式：npm run build:lib
 * 产物目录：lib/
 */

import path from "path";
import { Configuration } from "webpack";
import TerserPlugin from "terser-webpack-plugin";

const config: Configuration = {
    mode: "production",

    // 生成独立的 sourcemap 文件，便于生产环境调试
    devtool: "source-map",

    // 入口：统一导出文件
    entry: {
        index: path.resolve(__dirname, "../src/exports/index.ts"),
    },

    output: {
        path: path.resolve(__dirname, "../lib"),
        filename: "[name].js",
        // 输出为 ES Module 格式，支持 tree shaking
        library: {
            type: "module",
        },
        // 每次构建前清理 lib 目录
        clean: true,
    },

    // 启用 ES Module 输出实验特性
    experiments: {
        outputModule: true,
    },

    /**
     * 外部依赖配置
     * 这些依赖不会被打包进产物，由主项目提供
     * 避免重复打包和版本冲突
     */
    externals: [
        /^react$/,
        /^react-dom$/,
        /^react\/jsx-runtime$/,
    ],

    resolve: {
        extensions: [".tsx", ".ts", ".js", ".jsx"],
    },

    module: {
        rules: [
            // TypeScript / JavaScript 处理
            {
                test: /\.(ts|tsx)$/,
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            presets: [
                                ["@babel/preset-env", {
                                    // 保持 ES Module 格式，让 webpack 处理模块
                                    modules: false,
                                    // 不注入 polyfill，由主项目统一处理
                                    useBuiltIns: false,
                                    // 浏览器兼容目标
                                    targets: "> 0.25%, not dead",
                                }],
                                ["@babel/preset-react", { runtime: "automatic" }],
                                "@babel/preset-typescript",
                            ],
                            plugins: [
                                ["@babel/plugin-transform-runtime", {
                                    corejs: false,
                                    // 复用 babel helper 函数，减小体积
                                    helpers: true,
                                    regenerator: false,
                                }],
                            ],
                        },
                    },
                ],
                exclude: /node_modules/,
            },

            // 样式处理
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.s[ac]ss$/,
                use: ["style-loader", "css-loader", "sass-loader"],
            },

            // 静态资源处理（小于 8KB 转 base64）
            {
                test: /\.(png|jpe?g|gif|svg|webp)$/,
                type: "asset",
                parser: {
                    dataUrlCondition: {
                        maxSize: 8 * 1024,
                    },
                },
            },
        ],
    },

    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        // 生产环境移除 console 和 debugger
                        drop_console: true,
                        drop_debugger: true,
                    },
                    format: {
                        // 移除注释
                        comments: false,
                    },
                },
                // 不生成 LICENSE 文件
                extractComments: false,
            }),
        ],
        // 标记未使用的导出，配合 tree shaking
        usedExports: true,
        // 启用副作用分析
        sideEffects: true,
    },

    // 包体积警告阈值
    performance: {
        hints: "warning",
        maxAssetSize: 250 * 1024,        // 单个资源 250KB
        maxEntrypointSize: 250 * 1024,   // 入口文件 250KB
    },
};

export default config;
