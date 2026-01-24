// SCSS 模块类型声明
declare module "*.module.scss" {
    const classes: { [key: string]: string };
    export default classes;
}

declare module "*.scss" {
    const content: string;
    export default content;
}
