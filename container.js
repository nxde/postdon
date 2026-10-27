//require("dotenv").config();

const {
    createContainer,
    asClass,
    InjectionMode
} = require("awilix");

const GoogleSheetService =
    require("./services/googlesheet-service");

const OrderSheetService =
    require("./services/ordersheet-service");

const ProductSheetService =
    require("./services/productsheet-service");

const container = createContainer({
    injectionMode: InjectionMode.PROXY,
    strict: true
});

container.register({
    googleSheetService:
        asClass(GoogleSheetService).singleton(),

    orderSheetService:
        asClass(OrderSheetService).singleton(),

    productSheetService:
        asClass(ProductSheetService).singleton()
});

module.exports = container;