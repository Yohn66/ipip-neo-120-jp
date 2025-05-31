// scoring.js - IPIP-NEO-120 採点システム
// Johnson論文（N=320,128）データに基づくT得点計算

/**
 * 採点システムのメインクラス
 */
class IPIPNEOScoring {
    constructor(normsData, questionsData) {
        this.norms = normsData;
        this.questions = questionsData.questions;
        
        // 領域と側面のマッピング
        this.domainMapping = {
            'Neuroticism': ['Anxiety', 'Anger', 'Depression', 'Self-Consciousness', 'Immoderation', 'Vulnerability'],
            'Extraversion': ['Friendliness', 'Gregariousness', 'Assertiveness', 'Activity Level', 'Excitement-Seeking', 'Cheerfulness'],
            'Openness': ['Imagination', 'Artistic Interests', 'Emotionality', 'Adventurousness', 'Intellect', 'Liberalism'],
            'Agreeableness': ['Trust', 'Morality', 'Altruism', 'Cooperation', 'Modesty', 'Sympathy'],
            'Conscientiousness': ['Self-Efficacy', 'Orderliness', 'Dutifulness', 'Achievement-Striving', 'Self-Discipline', 'Cautiousness']
        };
        
        // 7段階評価基準
        this.evaluationLevels = [
            { min: 65, label: '非常に高い', description: '上位1.7%' },
            { min: 58, label: '高い', description: '上位11.2%' },
            { min: 52, label: 'やや高い', description: '上位26.0%' },
            { min: 48, label: '平均', description: '中央22.3%' },
            { min: 42, label: 'やや低い', description: '下位26.0%' },
            { min: 35, label: '低い', description: '下位11.2%' },
            { min: 0, label: '非常に低い', description: '下位1.7%' }
        ];
        
        console.log('採点システムを初期化しました');
    }

    /**
     * 120問の回答から完全な採点結果を算出
     * @param {Array} answers - 120問の回答配列（1-5の値）
     * @returns {Object} 採点結果オブジェクト
     */
    calculateFullResults(answers) {
        console.log('採点を開始します...', answers.length, '問');
        
        if (!Array.isArray(answers) || answers.length !== 120) {
            throw new Error('回答データが無効です。120問の回答が必要です。');
        }
        
        // 1. 側面得点を計算
        const facetScores = this.calculateFacetScores(answers);
        console.log('側面得点計算完了:', Object.keys(facetScores).length, '側面');
        
        // 2. 領域得点を計算
        const domainScores = this.calculateDomainScores(facetScores);
        console.log('領域得点計算完了:', Object.keys(domainScores).length, '領域');
        
        // 3. T得点変換
        const tScores = this.calculateTScores(domainScores, facetScores);
        console.log('T得点変換完了');
        
        // 4. 評価判定
        const evaluations = this.getEvaluations(tScores);
        console.log('評価判定完了');
        
        // 5. パーセンタイル計算
        const percentiles = this.calculatePercentiles(tScores);
        console.log('パーセンタイル計算完了');
        
        return {
            rawScores: {
                domains: domainScores,
                facets: facetScores
            },
            tScores: tScores,
            evaluations: evaluations,
            percentiles: percentiles,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 側面得点を計算（4問ずつ）
     * @param {Array} answers - 120問の回答
     * @returns {Object} 側面ごとの生得点
     */
    calculateFacetScores(answers) {
        const facetScores = {};
        
        // 各質問について側面得点に加算
        this.questions.forEach((question, index) => {
            const answer = answers[index];
            if (answer === undefined || answer === null) {
                throw new Error(`Q${index + 1}の回答がありません`);
            }
            
            const facetName = question.facet;
            
            // まだ初期化されていない側面は0で初期化
            if (!facetScores[facetName]) {
                facetScores[facetName] = 0;
            }
            
            // 採点方向を考慮して得点を加算
            if (question.keying === 'positive') {
                facetScores[facetName] += answer;
            } else if (question.keying === 'negative') {
                facetScores[facetName] += (6 - answer); // 逆転採点
            }
        });
        
        return facetScores;
    }

    /**
     * 領域得点を計算（6側面の合計）
     * @param {Object} facetScores - 側面得点
     * @returns {Object} 領域ごとの生得点
     */
    calculateDomainScores(facetScores) {
        const domainScores = {};
        
        Object.entries(this.domainMapping).forEach(([domainName, facets]) => {
            domainScores[domainName] = 0;
            
            facets.forEach(facetName => {
                if (facetScores[facetName] !== undefined) {
                    domainScores[domainName] += facetScores[facetName];
                } else {
                    console.warn(`側面 ${facetName} の得点が見つかりません`);
                }
            });
        });
        
        return domainScores;
    }

    /**
     * T得点を計算
     * @param {Object} domainScores - 領域生得点
     * @param {Object} facetScores - 側面生得点
     * @returns {Object} T得点
     */
    calculateTScores(domainScores, facetScores) {
        const tScores = {
            domains: {},
            facets: {}
        };
        
        // 領域のT得点
        Object.entries(domainScores).forEach(([domainName, rawScore]) => {
            const norm = this.norms.domains[domainName];
            if (norm) {
                tScores.domains[domainName] = this.rawToTScore(rawScore, norm.mean, norm.sd);
            }
        });
        
        // 側面のT得点
        Object.entries(facetScores).forEach(([facetName, rawScore]) => {
            const norm = this.norms.facets[facetName];
            if (norm) {
                tScores.facets[facetName] = this.rawToTScore(rawScore, norm.mean, norm.sd);
            }
        });
        
        return tScores;
    }

    /**
     * 生得点をT得点に変換
     * @param {number} rawScore - 生得点
     * @param {number} mean - 平均値
     * @param {number} sd - 標準偏差
     * @returns {number} T得点（小数点第1位まで）
     */
    rawToTScore(rawScore, mean, sd) {
        const tScore = 50 + (10 * (rawScore - mean) / sd);
        return Math.round(tScore * 10) / 10; // 小数点第1位まで
    }

    /**
     * T得点から評価レベルを判定
     * @param {Object} tScores - T得点
     * @returns {Object} 評価
     */
    getEvaluations(tScores) {
        const evaluations = {
            domains: {},
            facets: {}
        };
        
        // 領域の評価
        Object.entries(tScores.domains).forEach(([domainName, tScore]) => {
            evaluations.domains[domainName] = this.getEvaluationLevel(tScore);
        });
        
        // 側面の評価
        Object.entries(tScores.facets).forEach(([facetName, tScore]) => {
            evaluations.facets[facetName] = this.getEvaluationLevel(tScore);
        });
        
        return evaluations;
    }

    /**
     * T得点から評価レベルを取得
     * @param {number} tScore - T得点
     * @returns {Object} 評価情報
     */
    getEvaluationLevel(tScore) {
        for (const level of this.evaluationLevels) {
            if (tScore >= level.min) {
                return {
                    label: level.label,
                    description: level.description,
                    tScore: tScore
                };
            }
        }
        return this.evaluationLevels[this.evaluationLevels.length - 1];
    }

    /**
     * パーセンタイルを計算
     * @param {Object} tScores - T得点
     * @returns {Object} パーセンタイル
     */
    calculatePercentiles(tScores) {
        const percentiles = {
            domains: {},
            facets: {}
        };
        
        // 領域のパーセンタイル
        Object.entries(tScores.domains).forEach(([domainName, tScore]) => {
            percentiles.domains[domainName] = this.tScoreToPercentile(tScore);
        });
        
        // 側面のパーセンタイル
        Object.entries(tScores.facets).forEach(([facetName, tScore]) => {
            percentiles.facets[facetName] = this.tScoreToPercentile(tScore);
        });
        
        return percentiles;
    }

    /**
     * T得点をパーセンタイルに変換
     * @param {number} tScore - T得点
     * @returns {Object} パーセンタイル情報
     */
    tScoreToPercentile(tScore) {
        // T得点50（平均）= 50パーセンタイル
        // 正規分布を仮定してパーセンタイルを計算
        const zScore = (tScore - 50) / 10;
        let percentile = this.standardNormalCDF(zScore) * 100;
        
        // パーセンタイルを上位/下位表示に変換
        let position, label;
        if (percentile > 50) {
            position = 100 - percentile;
            label = '上位';
        } else {
            position = percentile;
            label = '下位';
        }
        
        // 表示形式を決定（有効数字ルール）
        let displayText;
        if (position >= 10) {
            // 10%以上: 整数表示
            displayText = `${label}${Math.round(position)}%`;
        } else if (position >= 0.1) {
            // 0.1%以上10%未満: 小数第1位
            displayText = `${label}${position.toFixed(1)}%`;
        } else if (position >= 0.01) {
            // 0.01%以上0.1%未満: 小数第2位
            displayText = `${label}${position.toFixed(2)}%`;
        } else {
            // 0.01%未満: 有効数字1桁
            if (position >= 0.001) {
                displayText = `${label}${position.toFixed(3)}%`;
            } else if (position >= 0.0001) {
                displayText = `${label}${position.toFixed(4)}%`;
            } else {
                displayText = `${label}${position.toExponential(0)}%`;
            }
        }
        
        return {
            percentile: Math.round(percentile * 10) / 10,
            position: Math.round(position * 100) / 100,
            label: label,
            displayText: displayText
        };
    }

    /**
     * 標準正規分布の累積分布関数（近似）
     * @param {number} z - Z得点
     * @returns {number} 累積確率
     */
    standardNormalCDF(z) {
        // Abramowitz and Stegun approximation
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = z < 0 ? -1 : 1;
        z = Math.abs(z) / Math.sqrt(2.0);

        const t = 1.0 / (1.0 + p * z);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

        return 0.5 * (1.0 + sign * y);
    }

    /**
     * 結果のサマリーを生成
     * @param {Object} results - 採点結果
     * @returns {string} サマリーテキスト
     */
    generateSummary(results) {
        let summary = 'IPIP-NEO-120 性格分析結果\n';
        summary += '================================\n\n';
        
        // 領域結果
        summary += '【5つの性格領域】\n';
        Object.entries(results.tScores.domains).forEach(([domainName, tScore]) => {
            const domainJP = this.norms.domains[domainName].japanese_name;
            const evaluation = results.evaluations.domains[domainName];
            const percentile = results.percentiles.domains[domainName];
            
            summary += `${domainJP}: ${tScore} (${evaluation.label} - ${percentile.displayText})\n`;
        });
        
        summary += '\n処理時刻: ' + new Date(results.timestamp).toLocaleString('ja-JP');
        
        return summary;
    }
}

// モジュール化対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IPIPNEOScoring;
}