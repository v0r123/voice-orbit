<div align="center">

<img src="https://img.shields.io/badge/VoiceOrbit-LAN%20Голосовой%20чат-4488ff?style=for-the-badge&logo=electron" alt="VoiceOrbit"/>

# 🚀 VoiceOrbit

**Голосовой чат для локальной сети с орбитальным интерфейсом**

[![Electron](https://img.shields.io/badge/Electron-28-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-333333?style=flat-square)](https://webrtc.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

[English](README.md) · [Русский](#)

</div>

---

## ✨ Описание

VoiceOrbit — **голосовой чат для LAN без серверов**, построенный на Electron, React и WebRTC.  
Вместо скучного списка контактов пиры отображаются как **планеты, вращающиеся вокруг центрального солнца** — ваша ракета свободно дрейфует в пространстве и летит к выбранным планетам по орбите.

Никаких серверов. Никаких аккаунтов. Интернет не нужен.

---

## 📸 Скриншоты

| Орбитальный интерфейс | Групповой звонок | Панель чата |
|:-:|:-:|:-:|
| ![Canvas](docs/screenshots/canvas.jpg) | ![Call](docs/screenshots/call.jpg) | ![Chat](docs/screenshots/chat.jpg) |

| Настройки и темы | Входящий звонок | Уведомление об обновлении |
|:-:|:-:|:-:|
| ![Settings](docs/screenshots/settings.jpg) | ![Incoming](docs/screenshots/incoming.jpg) | ![Update](docs/screenshots/update.jpg) |

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
- Уведомление о входящем звонке с кнопками Принять / Сбросить

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
8 встроенных цветовых тем с мгновенным применением через CSS-переменные:

| # | Тема | Акцент | Атмосфера |
|---|------|--------|-----------|
| 🌌 | Deep Space | `#4488ff` | Тёмно-синяя классика |
| 🔮 | Nebula | `#cc44ff` | Глубокий фиолет |
| ☀️ | Solar Flare | `#ff8800` | Тёмный янтарь |
| 🧊 | Arctic | `#00ccff` | Тёмный бирюзовый |
| 🌿 | Forest | `#44cc66` | Тёмный зелёный |
| 🔴 | Crimson | `#ff2244` | Почти чёрный красный |
| 🌙 | Midnight | `#9988ff` | Почти чёрный индиго |
| ☢️ | Toxic | `#7fff00` | Кислотный лайм на чёрном |

### ⚙️ Настройки
- Слайдер масштаба интерфейса (75 % – 140 %)
- Локальные никнеймы пиров (не транслируются)
- Выбор микрофона и устройства вывода
- Автоматическая настройка Windows Firewall при первом запуске

---

## 🏗️ Стек технологий

| Слой | Технология |
|------|-----------|
| Оболочка | **Electron 28** |
| UI | **React 18** + **TypeScript 5** + **Vite** |
| Состояние | **Zustand** |
| Голос | **WebRTC** `RTCPeerConnection` |
| Обнаружение | UDP broadcast (LAN) |
| Сигнализация | TCP (кастомный, без WebSocket) |
| Файлы | HTTP (`Worker` thread сервер) |
| БД | **SQLite** через **Prisma 7** + `better-sqlite3` |
| Сборка | **electron-builder** |

---

## 🚀 Быстрый старт

### Требования

- **Node.js 18+**
- **Windows 10 / 11** *(автообновление и скрипты firewall только для Windows)*

### Установка и запуск (dev)

```bash
git clone https://github.com/v0r123/voice-orbit.git
cd voice-orbit
npm install
npm run rebuild        # сборка better-sqlite3 под Electron ABI
npm run db:push        # создаёт voiceorbit.db со всеми таблицами
npm run db:generate    # генерирует TypeScript клиент Prisma
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
:: или
node scripts/build-test-versions.js 1.0.0 1.0.1 1.0.2
```

Результат: `release\test\<version>\VoiceOrbit.exe`

---

## 📁 Структура проекта

```
voice-orbit/
├── prisma/
│   └── schema.prisma             # Схема БД (таблицы)
├── prisma.config.ts              # Конфиг Prisma 7 (datasource URL)
├── src/
│   ├── main/                     # Electron main process
│   │   ├── db/
│   │   │   ├── client.ts         # Инициализация Prisma с адаптером
│   │   │   ├── migrate.ts        # Синхронизация схемы при старте
│   │   │   └── repository.ts     # Все DB операции
│   │   ├── index.ts              # Точка входа
│   │   ├── discovery.ts          # UDP обнаружение пиров
│   │   ├── signaling.ts          # TCP сигнализация
│   │   ├── fileServer.ts         # HTTP файловый сервер
│   │   ├── ipc.ts                # IPC хэндлеры
│   │   └── updatePackager.ts     # Сборка пакета обновления
│   │
│   ├── renderer/                 # React приложение
│   │   ├── components/
│   │   │   ├── OrbitCanvas/      # Canvas: планеты, ракета, орбиты
│   │   │   ├── Chat/             # ChatPanel, ChatDrawer
│   │   │   ├── CallOverlay/      # Панель участников звонка
│   │   │   └── Settings/         # Модальное окно настроек
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts      # WebRTC + синхронизация группового звонка
│   │   │   ├── useChat.ts        # Сообщения, файлы, сессии
│   │   │   └── useAutoUpdate.ts  # Обнаружение и установка обновлений
│   │   ├── store/index.ts        # Глобальное состояние Zustand
│   │   └── themes.ts             # 8 цветовых тем
│   │
│   └── shared/
│       └── types.ts              # Общие типы и SignalingMessage
│
└── docs/
    ├── PRISMA-SETUP.md           # Гайд по настройке Prisma
    └── screenshots/              # Скриншоты для README
```

---

## 🔧 Firewall

VoiceOrbit автоматически регистрирует правила Windows Firewall при первом запуске.  
Для ручной настройки (от имени Администратора):

```bat
test-launch\SETUP-FIREWALL-ADMIN.bat
```

| Диапазон портов | Протокол | Назначение |
|----------------|----------|-----------|
| 45678 – 45685 | UDP | Обнаружение пиров |
| 45700 – 45750 | TCP | Сигнализация |
| 45800 – 45810 | TCP | Передача файлов |

---

## 🤝 Участие в разработке

Pull request-ы приветствуются. Для крупных изменений сначала откройте issue.

1. Форкните репозиторий
2. Создайте ветку: `git checkout -b feature/amazing-feature`
3. Закоммитьте: `git commit -m 'feat: add amazing feature'`
4. Запушьте: `git push origin feature/amazing-feature`
5. Откройте Pull Request

---

## 📄 Лицензия

[MIT](LICENSE) © 2026

---

<div align="center">

Made with ☕ and TypeScript

**⭐ Поставь звезду если проект оказался полезным!**

</div>
