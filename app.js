/**
 * 냉장고를 부탁해 프론트엔드
 */

class FridgeRecipeApp {
    constructor() {
        this.currentImage = null;
        this.currentRecipe = null;
        this.recognizedIngredients = [];
        this.init();
    }

    init() {
        this.initSettingsModal();
        this.initImageUpload();
        this.initIngredientRecognition();
        this.initRecipeGeneration();
        this.updateUI();
    }

    /**
     * 설정 모달 초기화
     */
    initSettingsModal() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
        const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const apiKeyStatus = document.getElementById('apiKeyStatus');
        const modalBackdrop = settingsModal?.querySelector('.modal-backdrop');

        // 저장된 API 키 불러오기
        const savedApiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('openrouter_api_key');
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
        }

        const openModal = () => {
            settingsModal?.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        };

        const closeModal = () => {
            settingsModal?.classList.add('hidden');
            document.body.style.overflow = '';
            apiKeyStatus?.classList.add('hidden');
        };

        settingsBtn?.addEventListener('click', openModal);
        closeSettingsBtn?.addEventListener('click', closeModal);
        cancelSettingsBtn?.addEventListener('click', closeModal);
        modalBackdrop?.addEventListener('click', closeModal);

        saveApiKeyBtn?.addEventListener('click', () => {
            const apiKey = apiKeyInput.value.trim();

            if (!apiKey) {
                apiKeyStatus.textContent = '❌ API 키를 입력해주세요.';
                apiKeyStatus.style.color = '#ef4444';
                apiKeyStatus.classList.remove('hidden');
                return;
            }

            if (!apiKey.startsWith('AIzaSy') && apiKey.length < 20) {
                apiKeyStatus.textContent = '❌ 올바른 Google Gemini API 키 형식이 아닙니다. (AIzaSy...로 시작해야 합니다)';
                apiKeyStatus.style.color = '#ef4444';
                apiKeyStatus.classList.remove('hidden');
                return;
            }

            window.fridgeRecipeBackend.setApiKey(apiKey);
            apiKeyStatus.textContent = '✅ Gemini API 키가 저장되었습니다!';
            apiKeyStatus.style.color = '#10b981';
            apiKeyStatus.classList.remove('hidden');

            setTimeout(() => {
                closeModal();
            }, 1500);
        });

        apiKeyInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveApiKeyBtn?.click();
            }
        });
    }

    /**
     * 이미지 업로드 초기화
     */
    initImageUpload() {
        const uploadArea = document.getElementById('uploadArea');
        const imageInput = document.getElementById('imageInput');
        const selectImageBtn = document.getElementById('selectImageBtn');
        const imagePreview = document.getElementById('imagePreview');
        const previewImage = document.getElementById('previewImage');
        const removeImageBtn = document.getElementById('removeImageBtn');
        const ingredientsText = document.getElementById('ingredientsText');
        const generateRecipeBtn = document.getElementById('generateRecipeBtn');

        // 파일 선택 버튼
        selectImageBtn?.addEventListener('click', () => {
            imageInput?.click();
        });

        // 샘플 이미지 버튼들
        document.querySelectorAll('.sample-image-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sampleName = btn.dataset.sample;
                this.loadSampleImage(sampleName);
            });
        });

        // 파일 선택 시
        imageInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleImageFile(file);
            }
        });

        // 드래그 앤 드롭
        uploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea?.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea?.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleImageFile(file);
            }
        });

        // 이미지 제거
        removeImageBtn?.addEventListener('click', () => {
            this.currentImage = null;
            this.recognizedIngredients = [];
            imageInput.value = '';
            document.querySelector('.upload-placeholder')?.classList.remove('hidden');
            imagePreview?.classList.add('hidden');
            document.getElementById('recognizedIngredientsSection')?.classList.add('hidden');
            this.updateGenerateButton();
        });

        // 재료 입력 시
        ingredientsText?.addEventListener('input', () => {
            this.updateGenerateButton();
        });
    }

    /**
     * 이미지 최적화 (리사이징 및 품질 조정 - 빠른 AI 분석을 위해 800x800, quality 0.75 최적화)
     */
    async optimizeImage(imageBase64, maxWidth = 800, maxHeight = 800, quality = 0.75) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 비율 유지하면서 리사이징
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                // 이미지 품질 향상을 위한 설정
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // JPEG 형식으로 변환 (용량 감소)
                const optimizedBase64 = canvas.toDataURL('image/jpeg', quality);
                console.log(`이미지 최적화: ${img.width}x${img.height} → ${width}x${height}`);
                console.log(`크기 감소: ${(imageBase64.length / 1024).toFixed(2)}KB → ${(optimizedBase64.length / 1024).toFixed(2)}KB`);
                resolve(optimizedBase64);
            };
            img.onerror = () => reject(new Error('이미지 로드 실패'));
            img.src = imageBase64;
        });
    }

    /**
     * 샘플 이미지 로드
     */
    async loadSampleImage(sampleName) {
        try {
            const response = await fetch(`samples/${sampleName}`);
            const blob = await response.blob();

            // Blob을 base64로 변환
            const reader = new FileReader();
            reader.onload = async (e) => {
                // 이미지 최적화
                const optimizedImage = await this.optimizeImage(e.target.result);
                this.currentImage = optimizedImage;
                this.recognizedIngredients = [];

                const previewImage = document.getElementById('previewImage');
                previewImage.src = this.currentImage;
                document.querySelector('.upload-placeholder')?.classList.add('hidden');
                document.getElementById('imagePreview')?.classList.remove('hidden');

                // 새 이미지 업로드 시 재료 입력창 초기화
                const ingredientsText = document.getElementById('ingredientsText');
                ingredientsText.value = '';

                // 재료 인식 섹션 표시
                const recognizedSection = document.getElementById('recognizedIngredientsSection');
                recognizedSection?.classList.remove('hidden');

                // 재료 인식 안내 표시
                const recognizedContent = document.getElementById('recognizedIngredientsContent');
                recognizedContent.innerHTML = '<p class="recognized-hint">📸 "재료 분석하기" 버튼을 눌러 이미지 속 재료를 인식하세요.</p>';

                this.updateGenerateButton();
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            console.error('샘플 이미지 로드 실패:', error);
            this.showToast('샘플 이미지를 불러올 수 없습니다.', 'error');
        }
    }

    /**
     * 이미지 파일 처리
     */
    handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            // 이미지 최적화
            const optimizedImage = await this.optimizeImage(e.target.result);
            this.currentImage = optimizedImage;
            this.recognizedIngredients = [];

            const previewImage = document.getElementById('previewImage');
            previewImage.src = this.currentImage;
            document.querySelector('.upload-placeholder')?.classList.add('hidden');
            document.getElementById('imagePreview')?.classList.remove('hidden');

            // 새 이미지 업로드 시 재료 입력창 초기화
            const ingredientsText = document.getElementById('ingredientsText');
            ingredientsText.value = '';

            // 재료 인식 섹션 표시
            const recognizedSection = document.getElementById('recognizedIngredientsSection');
            recognizedSection?.classList.remove('hidden');

            // 재료 인식 안내 표시
            const recognizedContent = document.getElementById('recognizedIngredientsContent');
            recognizedContent.innerHTML = '<p class="recognized-hint">📸 "재료 분석하기" 버튼을 눌러 이미지 속 재료를 인식하세요.</p>';

            this.updateGenerateButton();
        };
        reader.readAsDataURL(file);
    }

    /**
     * 레시피 생성 버튼 상태 업데이트
     */
    updateGenerateButton() {
        const ingredientsText = document.getElementById('ingredientsText');
        const generateRecipeBtn = document.getElementById('generateRecipeBtn');

        const hasImage = this.currentImage !== null;
        const hasText = ingredientsText?.value.trim().length > 0;
        const hasRecognized = this.recognizedIngredients.length > 0;

        generateRecipeBtn.disabled = !(hasImage || hasText || hasRecognized);
    }

    /**
     * 재료 인식 초기화
     */
    initIngredientRecognition() {
        const analyzeImageBtn = document.getElementById('analyzeImageBtn');

        analyzeImageBtn?.addEventListener('click', () => {
            this.analyzeImage();
        });
    }

    /**
     * 이미지 분석 및 재료 인식
     */
    async analyzeImage() {
        if (!this.currentImage) {
            this.showToast('이미지를 먼저 업로드해주세요.', 'error');
            return;
        }

        const analyzeBtn = document.getElementById('analyzeImageBtn');
        const recognizedContent = document.getElementById('recognizedIngredientsContent');

        // 분석 중 표시
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<span class="btn-icon">⏳</span> 분석 중...';
        recognizedContent.innerHTML = '<div class="loading-mini"><div class="loading-spinner-small"></div><p>재료를 인식하는 중...</p></div>';

        try {
            const ingredients = await window.fridgeRecipeBackend.recognizeIngredients(this.currentImage);
            this.recognizedIngredients = ingredients;

            if (ingredients.length > 0) {
                // 인식된 재료 표시
                const html = `
                    <div class="recognized-list">
                        ${ingredients.map((ing, index) => `
                            <div class="recognized-item">
                                <span class="recognized-number">${index + 1}</span>
                                <span class="recognized-name">${ing}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p class="recognized-note">💡 이 재료들로 레시피를 추천받거나, 아래에 추가 재료를 입력하세요.</p>
                `;
                recognizedContent.innerHTML = html;

                // 재료를 텍스트 입력창에 업데이트 (항상 새로운 재료로 교체)
                const ingredientsText = document.getElementById('ingredientsText');
                ingredientsText.value = ingredients.join(', ');

                this.showToast(`${ingredients.length}개의 재료를 인식했습니다!`, 'success');
            } else {
                recognizedContent.innerHTML = '<p class="recognized-error">❌ 재료를 인식하지 못했습니다. 다른 사진을 시도해보세요.</p>';
                this.showToast('재료를 인식하지 못했습니다.', 'error');
            }
        } catch (error) {
            console.error('재료 인식 오류:', error);

            // 에러 메시지 분석
            let errorMessage = '❌ 재료 인식에 실패했습니다.';
            let toastMessage = '재료 인식에 실패했습니다.';

            if (error.message.includes('API 키')) {
                errorMessage = '❌ API 키를 설정해주세요.';
                toastMessage = '⚠️ API 키를 설정해주세요.';
            } else if (error.message.includes('처리하지 못했습니다')) {
                errorMessage = '❌ AI가 이 이미지를 처리하지 못했습니다.<br/>💡 더 단순하고 명확한 구도의 냉장고 사진을 업로드해보세요.';
                toastMessage = '이미지를 처리하지 못했습니다. 다른 사진을 시도해보세요.';
            } else if (error.message.includes('크기가 너무')) {
                errorMessage = '❌ 이미지 크기가 너무 큽니다. 작은 이미지를 사용해주세요.';
                toastMessage = '이미지 크기가 너무 큽니다.';
            } else if (error.message.includes('사용량이 많습니다')) {
                errorMessage = '❌ 무료 AI 서버가 현재 사용량이 많습니다.<br/>⏰ 잠시 후 다시 시도해주세요.';
                toastMessage = '서버가 바쁩니다. 잠시 후 다시 시도해주세요.';
            } else {
                errorMessage += ' 잠시 후 다시 시도해주세요.';
            }

            recognizedContent.innerHTML = `<p class="recognized-error">${errorMessage}</p>`;
            this.showToast(toastMessage, 'error');
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<span class="btn-icon">🔍</span> 재료 분석하기';
            this.updateGenerateButton();
        }
    }

    /**
     * 레시피 생성 초기화
     */
    initRecipeGeneration() {
        const generateRecipeBtn = document.getElementById('generateRecipeBtn');
        const newSearchBtn = document.getElementById('newSearchBtn');

        generateRecipeBtn?.addEventListener('click', () => {
            this.generateRecipe();
        });

        newSearchBtn?.addEventListener('click', () => {
            this.resetSearch();
        });
    }

    /**
     * 레시피 생성
     */
    async generateRecipe() {
        const ingredientsText = document.getElementById('ingredientsText');
        const ingredients = ingredientsText?.value.trim() || '';

        // UI 업데이트
        document.getElementById('loadingSection')?.classList.remove('hidden');
        document.getElementById('recipeResult')?.classList.add('hidden');

        try {
            // 이미지가 있으면 이미지와 함께 전송
            const recipe = await window.fridgeRecipeBackend.generateRecipe(
                ingredients,
                this.currentImage
            );
            this.currentRecipe = {
                ...recipe,
                ingredients: ingredientsText?.value.trim() || '냉장고 재료',
                timestamp: new Date().toISOString()
            };
            this.displayRecipe(this.currentRecipe);
        } catch (error) {
            console.error('레시피 생성 오류:', error);

            // API 키 오류인 경우
            if (error.message.includes('API 키')) {
                this.showToast('⚠️ API 키를 설정해주세요. 설정 버튼을 클릭하세요.', 'warning');
                // 대체 레시피 표시
                const fallbackRecipe = window.fridgeRecipeBackend.getFallbackRecipe(ingredients || '냉장고 재료');
                this.currentRecipe = {
                    ...fallbackRecipe,
                    ingredients: ingredients || '냉장고 재료',
                    timestamp: new Date().toISOString()
                };
                this.displayRecipe(this.currentRecipe);
            } else {
                this.showToast('레시피 생성에 실패했습니다. 다시 시도해주세요.', 'error');
            }
        } finally {
            document.getElementById('loadingSection')?.classList.add('hidden');
        }
    }

    /**
     * 레시피 표시
     */
    displayRecipe(recipe) {
        const recipeContent = document.getElementById('recipeContent');
        const recipeResult = document.getElementById('recipeResult');

        // ingredients와 steps를 배열로 변환
        const ingredients = Array.isArray(recipe.ingredients)
            ? recipe.ingredients
            : [recipe.ingredients];

        const steps = Array.isArray(recipe.steps)
            ? recipe.steps
            : [recipe.steps];

        const html = `
            <div class="recipe-header">
                <h3 class="recipe-dish-name">${recipe.dishName}</h3>
                <div class="recipe-meta">
                    <span class="recipe-badge">⏱️ ${recipe.cookingTime}</span>
                    <span class="recipe-badge">📊 ${recipe.difficulty}</span>
                </div>
            </div>

            <div class="recipe-section">
                <h4 class="recipe-section-title">
                    <span>🥬</span> 재료
                </h4>
                <ul class="recipe-ingredients-list">
                    ${ingredients.map(ing => `<li>${ing}</li>`).join('')}
                </ul>
            </div>

            <div class="recipe-section">
                <h4 class="recipe-section-title">
                    <span>👨‍🍳</span> 조리법
                </h4>
                <ol class="recipe-steps-list">
                    ${steps.map(step => `<li>${step}</li>`).join('')}
                </ol>
            </div>

            <div class="recipe-tip">
                <strong>💡 Tip:</strong> ${recipe.tip}
            </div>
        `;

        recipeContent.innerHTML = html;
        recipeResult?.classList.remove('hidden');

        // 결과로 스크롤
        recipeResult?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * 검색 초기화
     */
    resetSearch() {
        this.currentImage = null;
        this.currentRecipe = null;

        document.getElementById('imageInput').value = '';
        document.getElementById('ingredientsText').value = '';
        document.querySelector('.upload-placeholder')?.classList.remove('hidden');
        document.getElementById('imagePreview')?.classList.add('hidden');
        document.getElementById('recipeResult')?.classList.add('hidden');
        document.getElementById('recognizedIngredientsSection')?.classList.add('hidden');

        this.updateGenerateButton();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * UI 업데이트
     */
    updateUI() {
        this.updateGenerateButton();
    }

    /**
     * 토스트 메시지 표시
     */
    showToast(message, type = 'success') {
        const toast = document.getElementById('successToast');
        const toastMessage = toast?.querySelector('.toast-message');

        if (toastMessage) {
            toastMessage.textContent = message;
        }

        toast?.classList.remove('hidden');

        setTimeout(() => {
            toast?.classList.add('hidden');
        }, 3000);
    }
}

// 앱 초기화
let fridgeRecipeApp;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        fridgeRecipeApp = new FridgeRecipeApp();
        window.fridgeRecipeApp = fridgeRecipeApp;
    });
} else {
    fridgeRecipeApp = new FridgeRecipeApp();
    window.fridgeRecipeApp = fridgeRecipeApp;
}

console.log('냉장고를 부탁해 앱이 로드되었습니다.');
