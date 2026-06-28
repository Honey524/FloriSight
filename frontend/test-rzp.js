const Razorpay = require("razorpay");
const rzp = new Razorpay({
  key_id: "rzp_test_SxCbacPW5deUcj",
  key_secret: "aTZcX2dYQiK9I2T32dLc1ofS"
});
rzp.orders.create({
  amount: 1000,
  currency: "INR",
  receipt: "receipt_1"
}).then(console.log).catch(console.error);
