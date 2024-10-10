import { Inter } from "next/font/google";
import "./globals.css";
import Warnings from "./components/warnings";
import { assistantId } from "./assistant-config";
const inter = Inter({ subsets: ["latin"] });
import styles from "./examples/shared/page.module.css";

import Chat from "./components/chat";

export const metadata = {
  title: "Assistants API Quickstart",
  description: "A quickstart template using the Assistants API with OpenAI",
  icons: {
    icon: "/openai.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
      <main className={styles.main}>
        <div className={styles.container}>
          <Chat />
        </div>
      </main>
        {/* {assistantId ? children : <Warnings />} */}
        {/* <img className="logo" src="/openai.svg" alt="OpenAI Logo" /> */}
      </body>
    </html>
  );
}
