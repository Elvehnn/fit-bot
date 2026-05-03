// src/services/gigachatDirectService.js
const axios = require('axios');
const https = require('https');
const { URLSearchParams } = require('url');

class GigaChatDirectService {
  constructor() {
    this.accessToken = null;
    this.tokenExpires = null;
  }

  createApiClient() {
    return axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      timeout: 30000,
    });
  }

  async getAccessToken() {
    try {
      const apiClient = this.createApiClient();

      // Правильные параметры для GigaChat API
      const params = new URLSearchParams();
      params.append('scope', 'GIGACHAT_API_PERS');

      const response = await apiClient.post(
        'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${process.env.GIGACHAT_API_KEY}`,
            Accept: 'application/json',
            RqUID: this.generateRqUID(),
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpires = Date.now() + response.data.expires_in * 1000;

      console.log('✅ Токен GigaChat получен успешно');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Ошибка получения токена GigaChat:', error.response?.data || error.message);
      throw error;
    }
  }

  generateRqUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async generateCompletion(messages) {
    try {
      if (!this.accessToken || Date.now() >= this.tokenExpires) {
        await this.getAccessToken();
      }

      const apiClient = this.createApiClient();

      const response = await apiClient.post(
        'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        {
          model: 'GigaChat',
          messages: messages,
          temperature: 0.7,
          max_tokens: 2000,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('❌ Ошибка запроса к GigaChat:', error.response?.data || error.message);

      // Если ошибка авторизации, пробуем получить новый токен
      if (error.response?.status === 401) {
        console.log('🔄 Получаем новый токен...');
        this.accessToken = null;
        return this.generateCompletion(messages);
      }

      throw error;
    }
  }
}

module.exports = new GigaChatDirectService();
