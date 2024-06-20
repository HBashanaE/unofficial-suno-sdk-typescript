import axios from "axios";

import {
  browsers,
  DEFAULT_BASE_URL,
  DEFAULT_CLEARK_BASE_URL,
  osSystems,
} from "./consts";
import { getRandomNumber, randomChoice, waitMiliSeconds } from "./utils";

export default class Suno {
  baseUrl;
  clearkBaseUrl;
  client;
  currentToken: any;
  sid: any;

  private constructor(
    baseUrl = DEFAULT_BASE_URL,
    clearkBaseUrl = DEFAULT_CLEARK_BASE_URL,
    cookie: string
  ) {
    this.baseUrl = baseUrl;
    this.clearkBaseUrl = clearkBaseUrl;
    this.client = axios.create();
    this.client.defaults.headers["User-Agent"] = this.generateFakeUseragent();
    this.client.defaults.headers["Cookie"] = cookie;
  }

  static async initialize(
    baseUrl = DEFAULT_BASE_URL,
    clearkBaseUrl = DEFAULT_CLEARK_BASE_URL,
    cookie: string
  ) {
    const suno = new Suno(baseUrl, clearkBaseUrl, cookie);
    await suno.getSessionId();
    await suno.keepAlive();
    return suno;
  }

  private generateFakeUseragent() {
    const osSystem = randomChoice(osSystems);
    const browser = randomChoice(browsers);
    return `Mozilla/5.0 (${osSystem}) AppleWebKit/537.36 (KHTML, like Gecko) ${browser}`;
  }

  private checkError(response: any): void {
    if (response.status !== 200) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }
  }

  private async keepAlive(isWait: boolean = false): Promise<void> {
    if (!this.sid) {
      throw new Error("Session ID is not set. Cannot renew token.");
    }

    const renewUrl = `${this.clearkBaseUrl}/v1/client/sessions/${this.sid}/tokens?_clerk_js_version=4.72.0-snapshot.vc141245`;
    try {
      const renewResponse = await this.client.post(renewUrl);

      if (isWait) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 1000 + 1000)
        );
      }

      const newToken = renewResponse.data.jwt;
      this.currentToken = newToken;
      this.client.defaults.headers["Authorization"] = `Bearer ${newToken}`;
    } catch (error: any) {
      throw new Error(`Error renewing token: ${error.message}`);
    }
  }

  private async getSessionId(): Promise<void> {
    const url = `${this.clearkBaseUrl}/v1/client?_clerk_js_version=4.72.1`;
    try {
      const response = await this.client.get(url);
      if (!response.data.response) {
        throw new Error(
          "Failed to get session id, you may need to update the SUNO_COOKIE"
        );
      }
      if (response.data.response.last_active_session_id) {
        this.sid = response.data.response.last_active_session_id;
      } else {
        throw new Error(`Failed to get Session ID: ${response.status}`);
      }
    } catch (error: any) {
      throw new Error(`Error getting session ID: ${error.message}`);
    }
  }

  private async waitForAudio(songIds: string[]) {
    const startTime = Date.now();
    let lastClips: any = [];
    while (Date.now() - startTime < 100000) {
      try {
        const clips = await this.getSongs(songIds);
        const allCompleted = clips.every(
          (audio: any) =>
            audio.status === "streaming" || audio.status === "complete"
        );
        if (allCompleted) {
          return clips;
        }
        lastClips = clips;
      } catch (error) {
        const randomTime = getRandomNumber(3, 6);
        await waitMiliSeconds(randomTime * randomTime);
        await this.keepAlive();
      }
    }

    return lastClips;
  }

  async getCredits() {
    await this.keepAlive();
    const response = await this.client.get(`${this.baseUrl}/api/billing/info/`);

    this.checkError(response);
    if (response.status === 200) {
      const data = response.data;
      const result = {
        creditsLeft: data.total_credits_left,
        period: data.period,
        monthlyLimit: data.monthly_limit,
        monthlyUsage: data.monthly_usage,
      };
      return result;
    } else {
      throw new Error(`Error retrieving credits: ${response.data}`);
    }
  }

  async generate(
    prompt: string,
    isCustom: boolean,
    tags = "",
    title = "",
    makeInstrumental = false,
    waitAudio = false
  ) {
    this.keepAlive();
    const payload: any = {
      make_instrumental: makeInstrumental,
      mv: "chirp-v3-0",
      prompt: "",
    };

    if (isCustom) {
      payload["tags"] = tags;
      payload["title"] = title;
      payload["prompt"] = prompt;
    } else {
      payload["gpt_description_prompt"] = prompt;
    }

    const response: any = await this.client.post(
      `${this.baseUrl}/api/generate/v2/`,
      payload
    );

    this.checkError(response);

    const songIds = response.data?.clips.map((audio: any) => audio.id);
    if (waitAudio) {
      return this.waitForAudio(songIds);
    } else {
      await this.keepAlive(true);
      return response.data?.clips;
    }
  }

  async getSongs(songIds: string[]) {
    await this.keepAlive();
    let url = `${this.baseUrl}/api/feed/`;
    if (songIds) {
      let joinedSongIds;
      if (Array.isArray(songIds)) {
        joinedSongIds = songIds.join(",");
      } else {
        joinedSongIds = songIds;
      }
      url += `?ids=${joinedSongIds}`;
      const response = await this.client.get(url);
      this.checkError(response);
      return response.data;
    }
  }
}
