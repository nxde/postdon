require('dotenv').config();
require("./logger");

const { Bot } = require('node-telegram-bot-api');

//const OrderSheetService =  require("./ordersheet-service");
const container = require("./container");

const orderService = container.resolve("orderSheetService");


const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    throw new Error(
        'Chưa khai báo TELEGRAM_BOT_TOKEN trong file .env'
    );
}

// Khởi tạo bot theo API của phiên bản 2.x
const bot = new Bot(token);

//const oservice = new OrderSheetService();

// Lưu nội dung tin nhắn đã nhận để so sánh khi có chỉnh sửa.
// Lưu ý: Map này chỉ tồn tại trong bộ nhớ hiện tại.
const previousMessages = new Map();

function getContent(msg) {
    return msg.text ?? msg.caption ?? '';
}

function isGroupMessage(msg) {
    return (
        msg &&
        ['group', 'supergroup'].includes(msg.chat?.type)
    );
}

function getMessageInfo(msg) {
    return {
        chatId: msg.chat.id,
        chatTitle: msg.chat.title ?? '',
        messageId: msg.message_id,

        userId: msg.from?.id ?? null,
        userName: [
            msg.from?.first_name,
            msg.from?.last_name
        ].filter(Boolean).join(' '),
        username: msg.from?.username ?? null,

        content: getContent(msg),

        date: msg.date
            ? new Date(msg.date * 1000).toISOString()
            : null,

        editDate: msg.edit_date
            ? new Date(msg.edit_date * 1000).toISOString()
            : null
    };
}

// Sự kiện 1: Có tin nhắn mới
bot.on('message', async (ctx) => {
    const msg = ctx.update.message;

    // Chỉ nhận tin nhắn trong group/supergroup
    if (!isGroupMessage(msg)) return;

    // Bỏ qua bot khác và tin không có thông tin người gửi
    if (!msg.from || msg.from.is_bot) return;

    //const info = getMessageInfo(msg);
    const content=getContent(msg);
    const key = `${msg.chat.id}:${msg.message_id}`;

    //previousMessages.set(key, content);

    try {
        //console.error("Start posting order: ", orderService);
        await orderService.postOrder(key, content);
    console.log("Đã lưu đơn:", key);
    } catch (error) {
        console.error("Lưu đơn thất bại:", error.message);
    }

    //console.log('\n========== TIN MỚI ==========');
    //console.log(info);
});

// Sự kiện 2: Một tin nhắn đã gửi bị chỉnh sửa
bot.on('edited_message', async(ctx) => {
    const msg = ctx.update.edited_message;

    if (!msg) return;

    if (!isGroupMessage(msg)) return;
    if (!msg.from || msg.from.is_bot) return;

    //const info = getMessageInfo(msg);
    const key = `${msg.chat.id}:${msg.message_id}`;    
    const content = msg.text ?? msg.caption ?? "";

    //const oldContent = previousMessages.get(key);
    //const newContent = info.content;

    /*
    console.log('\n======= TIN ĐÃ CHỈNH SỬA =======');
    console.log({
        ...info,
        oldContent:
            oldContent !== undefined
                ? oldContent
                : '(Chưa lưu nội dung cũ)',
        newContent
    });
    */

    // Cập nhật để có thể so sánh ở lần chỉnh sửa tiếp theo
    //previousMessages.set(key, newContent);

    try {
        const result = await orderService.updateOrder(
            key,
            content
        );

        if (!result.updated) {
            console.warn(
                "Không cập nhật được đơn đã sửa:",
                result
            );
            return;
        }

        console.log("Đã cập nhật nội dung đơn:", key);
    } catch (error) {
        console.error(
            "Lỗi cập nhật đơn đã sửa:",
            error.message
        );
    }
});

// Xử lý lỗi trong các handler
bot.catch((err, ctx) => {
    console.error(
        'Lỗi xử lý update:',
        ctx?.update?.update_id,
        err
    );
});

// Bắt đầu nhận update bằng long polling
async function main() {
    try {
        const me = await bot.api.getMe();

        console.log(`Đã kết nối bot: @${me.username}`);
        console.log('Đang khởi động polling...');

        // Bắt đầu polling nhưng không await tại đây
        const pollingPromise = bot.startPolling();

        console.log('Đã bắt đầu polling, đang chờ tin nhắn...');

        // Bắt lỗi nếu vòng polling kết thúc do lỗi
        pollingPromise.catch((err) => {
            console.error('Polling bị lỗi:', err);
        });

    } catch (err) {
        console.error('Không thể khởi động bot:', err);
    }
}

main();