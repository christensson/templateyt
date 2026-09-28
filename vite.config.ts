import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

/*
      See https://vitejs.dev/config/
*/

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "../manifest.json",
          dest: ".",
        },
        {
          src: "*.*",
          dest: ".",
        },
        {
          src: "../public/*.*",
          dest: ".",
        },
        {
          src: "../public/icon-small.svg",
          dest: "./widgets",
        },
      ],
    }),
  ],
  root: "./src",
  base: "",
  publicDir: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    copyPublicDir: false,
    target: ["es2022"],
    assetsDir: "widgets/assets",
    rollupOptions: {
      input: {
        // List every widget entry point here
        templateytArticleApplyTemplateMenu: resolve(__dirname, 'src/widgets/templateyt-article-apply-template-menu/index.html'),

        templateytIssueMenu: resolve(__dirname, "src/widgets/templateyt-issue-menu/index.html"),

        templateytArticleMenu: resolve(__dirname, "src/widgets/templateyt-article-menu/index.html"),

        templateytProjectConfig: resolve(
          __dirname,
          "src/widgets/templateyt-project-config/index.html"
        ),
      },
    },
  },
});
