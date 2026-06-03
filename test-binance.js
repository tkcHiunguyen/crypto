import Binance from 'binance-api-node';

const client = Binance.default();

async function testBinanceResponse() {
    try {
        console.log('=== FUTURES EXCHANGE INFO ===\n');
        const exchangeInfo = await client.futuresExchangeInfo();
        const firstSymbol = exchangeInfo.symbols[0];
        
        console.log('First symbol object:');
        console.log(JSON.stringify(firstSymbol, null, 2));
        
        console.log('\n=== AVAILABLE FIELDS ===');
        console.log('Fields:', Object.keys(firstSymbol).join(', '));
        
        console.log('\n=== FUTURES CANDLES ===\n');
        const candles = await client.futuresCandles({
            symbol: 'BTCUSDT',
            interval: '15m',
            limit: 1
        });
        
        console.log('First candle object:');
        console.log(JSON.stringify(candles[0], null, 2));
        
        console.log('\n=== CANDLE FIELDS ===');
        console.log('Fields:', Object.keys(candles[0]).join(', '));
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testBinanceResponse();
