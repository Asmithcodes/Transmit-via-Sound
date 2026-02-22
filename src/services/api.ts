/**
 * Phase 1: MOCK API SERVICE
 * 
 * As per the Front-End First Execution Rule for the Anti-Gravity Architect Protocol,
 * no true backend calls or Web Audio DSP encoding/decoding logic are implemented here yet.
 * 
 * These functions simulate the latency and responses of the transmission engine.
 */

export const mockAudioEncode = async (payload: File | string, mode: 'simple' | 'advanced'): Promise<{ status: string, durationEstimate: number }> => {
    console.log(`[MOCK] Encoding payload ${typeof payload} with mode ${mode}`);
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ status: 'ENCODED', durationEstimate: 43000 });
        }, 1500);
    });
};

export const mockAudioListen = async (): Promise<{ status: string, payloadSize: number }> => {
    console.log(`[MOCK] Engaging microphone for acoustic handshake...`);
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ status: 'HANDSHAKE_RECEIVED', payloadSize: 4200000 });
        }, 4000);
    });
};

// Example of how the real Google API call will look in Phase 2
// export const fetchTelemetryAnalysis = async (logs: string[]) => {
//   // const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_API_KEY}`);
//   // ... fallback logic here
// };
