"use client";

import React, { useState, useEffect } from "react";
import styles from "../shared/page.module.css";
import Chat from "../../components/chat";
import WeatherWidget from "../../components/weather-widget";
import {RequiredActionFunctionToolCall} from "openai/resources/beta/threads/runs/runs";

interface WeatherData {
    location?: string;
    temperature?: number;
    conditions?: string;
}

const FunctionCalling = () => {
    const [weatherData, setWeatherData] = useState<WeatherData>({});
    const [token, setToken] = useState<string | null>(null);
    const isEmpty = Object.keys(weatherData).length === 0;

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setToken(params.get('user_token'));
    }, []);

    const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
        if (!token) return; // Guard clause if token isn't available
        if (call?.function?.name === "find_content") {
            const {query, type} = JSON.parse(call.function.arguments);
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/posts?type=${type}&q[title_cont]=${query}`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.NEXT_PUBLIC_BEARER_TOKEN}`,
                        token: token,
                    },
                });

                const data = await response.json();
                setWeatherData(data);
                return JSON.stringify(data);
            } catch (error) {
                console.error("Error finding content:", error);
            }
        } else if (call.function.name === "create_content") {
            try {
                // Get the arguments object
                const {title, description, content_type, parent_id} = JSON.parse(call.function.arguments);

                // Create URL parameters
                const params = new URLSearchParams({
                    'post[title]': title || '',
                    'post[post_type]': content_type || '',
                    'post[content][body]': description || '',
                });

                if (content_type === "problem") {
                    params.append('post[subject_id]', parent_id || '');
                } else if (content_type === "idea") {
                    params.append('post[problem_id]', parent_id || '');
                }

                // Append parameters to the URL
                const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/posts?${params.toString()}`;

                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.NEXT_PUBLIC_BEARER_TOKEN}`,
                        token: token,
                    }
                });

                const data = await response.json();
                setWeatherData(data);
                return JSON.stringify(data);
            } catch (error) {
                console.error("Error creating content:", error);
            }
        }
    };

    return (
        <main className={styles.main}>
            <div className={styles.container}>
                <div className={styles.column}>
                    <WeatherWidget
                        location={weatherData.location || "---"}
                        temperature={weatherData.temperature?.toString() || "---"}
                        conditions={weatherData.conditions || "Sunny"}
                        isEmpty={isEmpty}
                    />
                </div>
                <div className={styles.chatContainer}>
                    <div className={styles.chat}>
                        <Chat functionCallHandler={functionCallHandler}/>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default FunctionCalling;