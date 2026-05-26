<div align="center">

<img src="https://img.shields.io/badge/VoiceOrbit-LAN%20Voice%20Chat-4488ff?style=for-the-badge&logo=electron" alt="VoiceOrbit"/>

# 🚀 VoiceOrbit

**Local-network voice chat with an orbital canvas UI**

[![Electron](https://img.shields.io/badge/Electron-28-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-333333?style=flat-square)](https://webrtc.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

[English](README.md) · [Русский](#russian)

</div>

---
<a name="russian"></a>

<div align="center">

**Голосовой чат для локальной сети с орбитальным интерфейсом**

</div>

## ✨ Описание

VoiceOrbit — **голосовой чат для LAN без серверов**, построенный на Electron, React и WebRTC.  
Вместо скучного списка контактов пиры отображаются как **планеты, вращающиеся вокруг центрального солнца**. Ваша ракета свободно дрейфует в пространстве и летит к выбранным планетам по орбите.

Никаких серверов. Никаких аккаунтов. Интернет не нужен.

---

## 🎯 Возможности

### 🌌 Орбитальный интерфейс
- Пиры — **анимированные планеты** на орбитах вокруг тебя (солнце)
- Ракета **свободно дрейфует** в простое и **летит к выбранной планете**, выходя на орбиту
- Текстуры планет генерируются из ID пира — каждый пользователь выглядит уникально
- **Эффект ряби** на краях экрана при входящих сообщениях (цвет совпадает с темой)
- Пульсация планеты когда пир говорит
- Линии связи между участниками звонка
- Звёздное поле с мерцанием; фоновый градиент тоже меняется под тему

### 🎙️ Голосовые звонки
- **Личные и групповые звонки** по WebRTC (P2P, TURN-сервер не нужен в LAN)
- Синхронизация списка участников — все видят кто вошёл и кто вышел
- Отключение микрофона, регулировка громкости для каждого пира
- Рингтон ожидания ответа

### 💬 Чат
- **Личные сообщения** и **групповые чаты** (выбери несколько планет → *Group Chat*)
- Выезжающая панель чатов справа с бейджем количества непрочитанных чатов
- Навигация: список сессий → переписка (как в обычном мессенджере)
- Имена отправителей цветом их планеты в групповых чатах
- Отправка файлов с прогресс-баром; предпросмотр изображений; вставка из буфера `Ctrl+V`
- Анимация пузырей новых сообщений
- Умный автоскролл — останавливается при прокрутке вверх; кнопка возврата вниз

### 🔄 Автообновление по LAN
- При старте опрашивает всех пиров на наличие новой версии
- Выбирает **наибольшую версию** в сети как источник обновления
- Пакет обновления строится **по запросу** (только `app.asar`, ~2–5 МБ вместо 150 МБ)
- Скачивание без диалога выбора папки; `updater.bat` ждёт закрытия, заменяет файлы, перезапускает

### 🎨 Темы
8 встроенных цветовых тем с мгновенным применением:
🌌 Deep Space · 🔮 Nebula · ☀️ Solar Flare · 🧊 Arctic · 🌿 Forest · 🔴 Crimson · 🌙 Midnight · ☢️ Toxic

---

## 🚀 Быстрый старт

```bash
git clone https://github.com/your-username/voice-orbit.git
cd voice-orbit
npm install
npm run dev
```

### Продакшен сборка

```bash
npm run build
npx electron-builder
```

### Несколько версий для тестирования обновлений

```bat
BUILD-TEST-VERSIONS.bat
```

Результат: `release\test\<version>\VoiceOrbit.exe`

---

## 📄 Лицензия

[MIT](LICENSE) © 2024

---

<div align="center">

Made with ☕ and TypeScript

**⭐ Поставь звезду если проект оказался полезным!**

</div>
