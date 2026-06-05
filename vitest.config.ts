import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      SBI_IPO_URL: "https://www.sbisec.co.jp/ETGate/?_ControlID=WPLETmgR001Control&_PageID=WPLETmgR001Mdtl30&_ActionID=DefaultAID&_DataStoreID=DSWPLETmgR001Control&OutSide=on&getFlg=on&burl=search_foreign&cat1=foreign&cat2=ipo&dir=ipo&file=foreign_ipo_260527.html",
      SITE_TITLE: "SBI IPO Monitor (Test)",
      SENDER_EMAIL: "shibata@neoanaloglab.com",
      SENDER_NAME: "SBI IPO Monitor",
      SITE_URL: "http://localhost:8787",
    },
  },
});
