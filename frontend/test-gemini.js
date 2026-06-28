const { GoogleGenerativeAI } = require("@google/generative-ai");
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  try {
    const models = ["text-embedding-004", "embedding-001", "embedding-004"];
    for (const m of models) {
      try {
        const model = ai.getGenerativeModel({ model: m });
        await model.embedContent({ content: { parts: [{ text: "hello" }] } });
        console.log(`Success: ${m}`);
      } catch (e) {
        console.log(`Failed: ${m} - ${e.message}`);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
run();
