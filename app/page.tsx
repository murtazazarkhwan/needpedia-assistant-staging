"use client";

import React from "react";
import styles from "./examples/basic-chat/page.module.css"; // use simple styles for demonstration purposes
import Chat from "./components/chat";

const Home = () => {

  return (
    <main className={styles.main}>
     <div className={styles.container}>
      <Chat />
      </div>
      {/* <div className={styles.container}> */}
        {/* <div className={styles.column}>
          <FileViewer />
        </div> */}
        {/* <div className={styles.chatContainer}>
          <div className={styles.chat}>
            <Chat />
          </div>
        </div> */}
      {/* </div> */}
    </main>
  );
};

export default Home;
