const fs = require("fs");
const path = require("path");
const util = require("util");

// Thư mục lưu log nằm cạnh file logger.js
const logDir = path.join(__dirname, "logs");

fs.mkdirSync(logDir, { recursive: true });

// Lưu các hàm console gốc để vẫn hiện log trên CMD
const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
};

// Tạo timestamp theo giờ địa phương của máy tính
function getTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");

    const date = [
        d.getFullYear(),
        pad(d.getMonth() + 1),
        pad(d.getDate())
    ].join("-");

    const time = [
        pad(d.getHours()),
        pad(d.getMinutes()),
        pad(d.getSeconds())
    ].join(":");

    return {
        date,
        timestamp: `${date} ${time}`
    };
}

// Ghi một dòng log vào file của ngày tương ứng
function writeLog(level, args) {
    const { date, timestamp } = getTimestamp();
    const file = path.join(logDir, `post_order-${date}.log`);
    const message = util.format(...args);
    const line = `${timestamp} [${level}] ${message}\r\n`;

    try {
        fs.appendFileSync(file, line, "utf8");
    } catch (err) {
        originalConsole.error("Không ghi được file log:", err);
    }
}

// Ghi log ra cả CMD và file
for (const [method, level] of [
    ["log", "INFO"],
    ["info", "INFO"],
    ["warn", "WARN"],
    ["error", "ERROR"],
    ["debug", "DEBUG"]
]) {
    console[method] = (...args) => {
        originalConsole[method](...args);
        writeLog(level, args);
    };
}

console.log("===== Hệ thống ghi log đã khởi động =====");