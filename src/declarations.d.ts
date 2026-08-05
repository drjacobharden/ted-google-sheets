declare global {
  module "*.html" {
    const content: string;
    export default content;
  }

  module "*.css";

}

export {};
