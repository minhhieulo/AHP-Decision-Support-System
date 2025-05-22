document.addEventListener('DOMContentLoaded', function() {
    // Các biến danh sách tiêu chí và thương hiệu được lấy từ Flask thông qua config.js
    const criteriaLabels = typeof criteria_list !== 'undefined' ? criteria_list : ["Tiêu chí 1", "Tiêu chí 2", "Tiêu chí 3"];
    const brandLabels = typeof brands_list !== 'undefined' ? brands_list : ["Thương hiệu A", "Thương hiệu B", "Thương hiệu C"];

    let brandsChartInstance = null;
    let criteriaChartInstance = null;
    let criteriaPieChartInstance = null;

    let historyData = []; 
    let currentHistoryPage = 1;
    const ITEMS_PER_PAGE = 5;

    // Cache các phần tử DOM
    const criteriaTable = document.getElementById('criteriaTable');
    const brandComparisonSection = document.getElementById('brandComparisonSection');
    const checkCriteriaConsistencyBtn = document.getElementById('checkCriteriaConsistencyBtn');
    const criteriaConsistencyResult = document.getElementById('criteriaConsistencyResult');
    const criterionButtonsContainer = document.getElementById('criterionButtons');
    const brandComparisonTablesContainer = document.getElementById('brandComparisonTablesContainer');
    const calculateBtn = document.getElementById('calculateBtn');
    const criteriaWeightsList = document.getElementById('criteriaWeightsList');
    const criteriaCRSpan = document.getElementById('criteriaCR');
    const criteriaConsistencyMessage = document.getElementById('criteriaConsistencyMessage');
    const brandScoresList = document.getElementById('brandScoresList');
    const bestBrandElement = document.getElementById('bestBrand');
    const historyListContainer = document.getElementById('historyListContainer');
    const loadHistoryBtn = document.getElementById('loadHistoryBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const historyPagination = document.getElementById('historyPagination');
    const noHistoryMessage = document.getElementById('noHistoryMessage');

    // NEW: Các input file cho việc nhập liệu
    const importCriteriaFile = document.getElementById('importCriteriaFile');
    const importBrandFiles = {}; // Đối tượng để lưu trữ các input file của thương hiệu theo index tiêu chí

    // Khởi tạo brandsComparisonMatrices với giá trị mặc định 1
    const brandsComparisonMatrices = Array(criteriaLabels.length).fill(null).map(() => {
        return Array(brandLabels.length).fill(null).map(() => Array(brandLabels.length).fill(1));
    });

    let calculatedCriteriaWeights = [];

    // --- Hàm chuyển đổi section (cho Navbar) ---
    document.querySelectorAll('nav .nav-link').forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault();
            const targetSectionId = this.dataset.section;

            document.querySelectorAll('.section-content').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetSectionId).classList.add('active');

            document.querySelectorAll('nav .nav-link').forEach(navLink => {
                navLink.classList.remove('active');
            });
            this.classList.add('active');

            const navbarToggler = document.querySelector('.navbar-toggler');
            const navbarCollapse = document.getElementById('navbarNav');
            if (navbarToggler && navbarCollapse.classList.contains('show')) {
                const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
                if (bsCollapse) {
                    bsCollapse.hide();
                }
            }
        });
    });

    // --- Hàm khởi tạo ma trận ban đầu và xử lý input ---
    function initializeMatrix(tableId, labels) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const inputs = table.querySelectorAll('.ahp-input');
        inputs.forEach(input => {
            const row = parseInt(input.dataset.row);
            const col = parseInt(input.dataset.col);

            if (row === col) {
                input.value = 1;
                input.disabled = true;
            } else if (row > col) {
                input.disabled = true;
            } else {
                if (input.value === "" || isNaN(parseFloat(input.value))) {
                    input.value = 1;
                }
                input.disabled = false;
            }
            input.removeEventListener('input', handleMatrixInputChange);
            input.addEventListener('input', handleMatrixInputChange);
        });
    }

    // NEW: Hàm cập nhật ma trận trên giao diện từ dữ liệu nhập
    function updateMatrixUI(tableId, matrixData, labelsLength) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const inputs = table.querySelectorAll('.ahp-input');
        
        for (let i = 0; i < labelsLength; i++) {
            for (let j = 0; j < labelsLength; j++) {
                const input = inputs[i * labelsLength + j];
                if (input) {
                    // Đảm bảo giá trị là số và định dạng lại nếu cần
                    const value = parseFloat(matrixData[i][j]);
                    input.value = (i === j) ? 1 : value.toFixed(2); // Đường chéo chính luôn là 1
                    if (i > j) {
                        // Giá trị nghịch đảo sẽ được tính tự động từ ô đối xứng
                        input.value = (1 / parseFloat(inputs[j * labelsLength + i].value)).toFixed(2);
                    }
                }
            }
        }
        console.log(`UI của bảng ${tableId} đã được cập nhật với dữ liệu nhập.`);
    }


    function handleMatrixInputChange(event) {
        let value = parseFloat(event.target.value);
        const row = parseInt(event.target.dataset.row);
        const col = parseInt(event.target.dataset.col);
        const tableId = event.target.closest('table').id;

        if (isNaN(value) || value < 1) {
            value = 1;
            event.target.value = 1;
        } else if (value > 9) {
            value = 9;
            event.target.value = 9;
        }

        const table = document.getElementById(tableId);
        const inputs = table.querySelectorAll('.ahp-input');
        const labelsLength = (tableId === 'criteriaTable') ? criteriaLabels.length : brandLabels.length;

        if (row < col) {
            const inverseInput = inputs[col * labelsLength + row];
            inverseInput.value = (1 / value).toFixed(2);
        }
    }

    initializeMatrix('criteriaTable', criteriaLabels);

    // --- Hàm đọc ma trận từ DOM ---
    function getMatrix(tableId, labelsLength) {
        const matrix = [];
        const inputs = document.getElementById(tableId).querySelectorAll('.ahp-input');
        for (let i = 0; i < labelsLength; i++) {
            const row = [];
            for (let j = 0; j < labelsLength; j++) {
                row.push(parseFloat(inputs[i * labelsLength + j].value));
            }
            matrix.push(row);
        }
        console.log(`Đã lấy ma trận từ ${tableId}:`, matrix);
        return matrix;
    }

    // --- Hàm gửi yêu cầu POST đến Flask API (có hoặc không có file) ---
    async function postData(endpoint, data, isFormData = false) {
        console.log(`Đang gửi yêu cầu POST đến ${endpoint} với dữ liệu:`, data);
        let fetchOptions = {
            method: 'POST',
        };

        if (isFormData) {
            fetchOptions.body = data; // FormData không cần 'Content-Type' header
        } else {
            fetchOptions.headers = {
                'Content-Type': 'application/json'
            };
            fetchOptions.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(endpoint, fetchOptions);

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const result = await response.json();
                if (!response.ok) {
                    console.error(`Lỗi phản hồi API ${endpoint}:`, result);
                    throw new Error(result.error || `Lỗi HTTP ${response.status}: ${response.statusText}`);
                }
                console.log(`Phản hồi thành công từ ${endpoint}:`, result);
                return result;
            } else {
                const text = await response.text();
                console.error(`Phản hồi không phải JSON từ ${endpoint}:`, text);
                throw new Error(`Phản hồi không phải JSON. Trạng thái: ${response.status}. Phản hồi: ${text.substring(0, 200)}...`);
            }
        } catch (error) {
            console.error(`Lỗi khi gọi API ${endpoint}:`, error);
            throw error;
        }
    }

    // --- Xử lý nút "Kiểm tra nhất quán tiêu chí" ---
    checkCriteriaConsistencyBtn.addEventListener('click', async () => {
        console.log('Nút "Kiểm tra nhất quán tiêu chí" được nhấn.');
        const criteriaMatrix = getMatrix('criteriaTable', criteriaLabels.length);
        try {
            const result = await postData('/check_criteria_consistency', { matrix: criteriaMatrix }); 

            const cr = result.cr;
            calculatedCriteriaWeights = result.weights;
            criteriaCRSpan.textContent = cr.toFixed(4);

            let message = '';
            if (cr < 0.1) {
                message = '<span class="text-success fw-bold">Đạt yêu cầu (nhất quán).</span>';
                brandComparisonSection.classList.remove('disabled-overlay');
                criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                    btn.disabled = false;
                });
                calculateBtn.disabled = false;

                document.querySelector('a[data-section="brand-comparison"]').click();

            } else {
                message = '<span class="text-danger fw-bold">Không đạt yêu cầu (không nhất quán). Vui lòng điều chỉnh lại các giá trị!</span>';
                brandComparisonSection.classList.add('disabled-overlay');
                criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                    btn.disabled = true;
                });
                calculateBtn.disabled = true;
            }
            criteriaConsistencyResult.innerHTML = `
                <div class="alert ${cr < 0.1 ? 'alert-success' : 'alert-warning'} d-flex align-items-center mt-3" role="alert">
                    <i class="bi ${cr < 0.1 ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} flex-shrink-0 me-2"></i>
                    <div>Tỷ lệ nhất quán (CR): ${cr.toFixed(4)} - ${message}</div>
                </div>`;
            
            criteriaWeightsList.innerHTML = '';
            calculatedCriteriaWeights.forEach((weight, index) => {
                const li = document.createElement('li');
                li.className = 'list-group-item';
                li.innerHTML = `<span>${criteriaLabels[index]}:</span> <span class="badge bg-primary">${(weight * 100).toFixed(2)}%</span>`;
                criteriaWeightsList.appendChild(li);
            });
            updateCriteriaPieChart(calculatedCriteriaWeights);

        } catch (error) {
            console.error('Lỗi khi kiểm tra nhất quán tiêu chí:', error);
            criteriaConsistencyResult.innerHTML = `
                <div class="alert alert-danger d-flex align-items-center mt-3" role="alert">
                    <i class="bi bi-exclamation-triangle-fill flex-shrink-0 me-2"></i>
                    <div>Lỗi: ${error.message}. Vui lòng kiểm tra lại dữ liệu nhập.</div>
                </div>`;
            brandComparisonSection.classList.add('disabled-overlay');
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.disabled = true;
            });
            calculateBtn.disabled = true;
        }
    });

    // --- Xử lý nút "Nhập từ File" cho ma trận tiêu chí ---
    importCriteriaFile.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        console.log('Đang nhập file cho ma trận tiêu chí:', file.name);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await postData('/import_criteria_matrix', formData, true); // true cho isFormData
            alert(result.message);
            updateMatrixUI('criteriaTable', result.matrix, criteriaLabels.length);
            // Xóa file đã chọn khỏi input để có thể chọn lại cùng file
            event.target.value = ''; 
        } catch (error) {
            console.error('Lỗi khi nhập ma trận tiêu chí từ file:', error);
            alert(`Lỗi nhập file: ${error.message}`);
            event.target.value = ''; // Xóa file đã chọn
        }
    });


    // --- Xử lý các nút chọn tiêu chí để so sánh thương hiệu ---
    criterionButtonsContainer.addEventListener('click', function(event) {
        if (event.target.classList.contains('criterion-select-btn')) {
            console.log('Nút tiêu chí được nhấn:', event.target.textContent.trim());
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');

            brandComparisonTablesContainer.querySelectorAll('.brand-comparison-table-wrapper').forEach(tableDiv => {
                tableDiv.style.display = 'none';
            });

            const criterionIndex = event.target.dataset.criterionIndex;
            const targetTableWrapper = document.getElementById(`brandTableWrapper_${criterionIndex}`);
            if (targetTableWrapper) {
                targetTableWrapper.style.display = 'block';
                initializeMatrix(`brandTable_${criterionIndex}`, brandLabels);
            }
        }
    });

    // --- Gán sự kiện cho các input file của ma trận thương hiệu ---
    // Cần lặp qua tất cả các input file tiềm năng
    criteriaLabels.forEach((_, index) => {
        const inputId = `importBrandFile_${index}`;
        const inputElement = document.getElementById(inputId);
        if (inputElement) {
            importBrandFiles[index] = inputElement; // Lưu trữ tham chiếu
            inputElement.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                const criterionIndex = parseInt(event.target.dataset.criterionIndex);
                if (!file) return;

                console.log(`Đang nhập file cho ma trận thương hiệu (tiêu chí ${criterionIndex}):`, file.name);
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const result = await postData(`/import_brand_matrix/${criterionIndex}`, formData, true);
                    alert(result.message);
                    updateMatrixUI(`brandTable_${criterionIndex}`, result.matrix, brandLabels.length);
                    // Cập nhật ma trận trong bộ nhớ sau khi nhập thành công
                    brandsComparisonMatrices[criterionIndex] = result.matrix;
                    event.target.value = ''; // Xóa file đã chọn
                } catch (error) {
                    console.error(`Lỗi khi nhập ma trận thương hiệu cho tiêu chí ${criterionIndex} từ file:`, error);
                    alert(`Lỗi nhập file: ${error.message}`);
                    event.target.value = ''; // Xóa file đã chọn
                }
            });
        }
    });


    // --- Xử lý sự kiện input cho các bảng so sánh thương hiệu ---
    brandComparisonTablesContainer.addEventListener('input', function(event) {
        if (event.target.classList.contains('ahp-input')) {
            const tableId = event.target.closest('table').id;
            const criterionIndex = parseInt(tableId.split('_')[1]);
            const row = parseInt(event.target.dataset.row);
            const col = parseInt(event.target.dataset.col);
            let value = parseFloat(event.target.value);

            if (isNaN(value) || value < 1) {
                value = 1;
                event.target.value = 1;
            } else if (value > 9) {
                value = 9;
                event.target.value = 9;
            }

            brandsComparisonMatrices[criterionIndex][row][col] = value;
            brandsComparisonMatrices[criterionIndex][col][row] = 1 / value;

            const table = document.getElementById(tableId);
            const inputs = table.querySelectorAll('.ahp-input');
            const inverseInput = inputs[col * brandLabels.length + row];
            inverseInput.value = (1 / value).toFixed(2);
            console.log(`Ma trận thương hiệu cho tiêu chí ${criterionIndex} cập nhật:`, brandsComparisonMatrices[criterionIndex]);
        }
    });

    // --- Hàm cập nhật biểu đồ cột trọng số thương hiệu ---
    function updateBrandsChart(brandsLabels, brandsScores, bestBrand) {
        console.log('Đang cập nhật biểu đồ thương hiệu. Nhãn:', brandsLabels, 'Điểm số:', brandsScores);
        const ctx = document.getElementById('brandsChart').getContext('2d');
        const backgroundColors = [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 206, 86, 0.7)',
            'rgba(75, 192, 192, 0.7)',
            'rgba(153, 102, 255, 0.7)'
        ];

        if (brandsChartInstance) {
            brandsChartInstance.destroy();
        }

        brandsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: brandsLabels,
                datasets: [{
                    label: 'Điểm số thương hiệu',
                    data: brandsScores,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(color => color.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Điểm số',
                            font: { size: 14, weight: 'bold' }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Thương hiệu',
                            font: { size: 14, weight: 'bold' }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'So sánh điểm số tổng hợp các thương hiệu',
                        font: { size: 16, weight: 'bold' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) { label += context.parsed.y.toFixed(4); }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        bestBrandElement.textContent = bestBrand;
    }

    // --- Hàm cập nhật biểu đồ tròn trọng số tiêu chí ---
    function updateCriteriaPieChart(criteriaWeights) {
        console.log('Đang cập nhật biểu đồ tròn tiêu chí. Trọng số:', criteriaWeights);
        const ctx = document.getElementById('criteriaPieChart').getContext('2d');

        const backgroundColors = [
            '#42A5F5', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC', '#7E57C2', '#26A69A'
        ];
        while(backgroundColors.length < criteriaLabels.length) {
            backgroundColors.push('#' + Math.floor(Math.random()*16777215).toString(16));
        }

        if (criteriaPieChartInstance) {
            criteriaPieChartInstance.destroy();
        }

        criteriaPieChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: criteriaLabels,
                datasets: [{
                    label: 'Trọng số',
                    data: criteriaWeights,
                    backgroundColor: backgroundColors.slice(0, criteriaLabels.length),
                    borderColor: '#fff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 12 } } },
                    title: {
                        display: true,
                        text: 'Biểu đồ Trọng số các Tiêu chí',
                        font: { size: 16, weight: 'bold' },
                        color: '#333'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed !== null) { label += (context.parsed * 100).toFixed(2) + '%'; }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- Xử lý nút "Tính toán và Đưa ra Khuyến nghị" ---
    calculateBtn.addEventListener('click', async () => {
        console.log('Nút "Tính toán và Đưa ra Khuyến nghị" được nhấn.');
        if (calculatedCriteriaWeights.length === 0) {
            alert('Vui lòng kiểm tra nhất quán tiêu chí trước khi tính toán!');
            console.warn('Tính toán bị dừng: Trọng số tiêu chí chưa được tính.');
            return;
        }

        const criteriaMatrix = getMatrix('criteriaTable', criteriaLabels.length);
        
        const brandMatricesDataToSend = {};
        for (let i = 0; i < criteriaLabels.length; i++) {
            const currentTable = document.getElementById(`brandTable_${i}`);
            if (currentTable) {
                // Lấy ma trận từ bộ nhớ (brandsComparisonMatrices) thay vì từ DOM
                brandMatricesDataToSend[criteriaLabels[i]] = brandsComparisonMatrices[i];
            } else {
                brandMatricesDataToSend[criteriaLabels[i]] = Array(brandLabels.length).fill(null).map(() => Array(brandLabels.length).fill(1));
            }
        }

        try {
            const data = await postData('/calculate', {
                criteria_matrix: criteriaMatrix,
                brand_matrices: brandMatricesDataToSend
            });

            console.log('Dữ liệu nhận được từ /calculate:', data);

            if (data.criteria_weights && data.criteria_weights.length > 0) {
                criteriaWeightsList.innerHTML = '';
                data.criteria_weights.forEach((weight, index) => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item';
                    li.innerHTML = `<span>${criteriaLabels[index]}:</span> <span class="badge bg-primary">${(weight * 100).toFixed(2)}%</span>`;
                    criteriaWeightsList.appendChild(li);
                });
                criteriaCRSpan.textContent = data.criteria_cr.toFixed(4);
                const consistencyMsg = data.criteria_consistent ? '<span class="text-success fw-bold">Nhất quán (CR < 0.1)</span>' : '<span class="text-danger fw-bold">Không nhất quán (CR >= 0.1) - Vui lòng xem xét lại đánh giá của bạn!</span>';
                criteriaConsistencyMessage.innerHTML = consistencyMsg;
                updateCriteriaPieChart(data.criteria_weights);
            }

            const finalBrandScores = data.final_brand_scores;
            const bestBrandName = finalBrandScores[0][0];

            brandScoresList.innerHTML = '';
            finalBrandScores.forEach(item => {
                const li = document.createElement('li');
                li.className = 'list-group-item';
                li.innerHTML = `<span>${item[0]}:</span> <span class="badge bg-success">${parseFloat(item[1]).toFixed(4)}</span>`;
                brandScoresList.appendChild(li);
            });

            updateBrandsChart(finalBrandScores.map(item => item[0]), finalBrandScores.map(item => item[1]), bestBrandName);

            document.querySelector('a[data-section="results-charts"]').click();

            loadHistory();

        } catch (error) {
            console.error('Lỗi khi gửi yêu cầu tính toán tổng hợp:', error);
            alert(`Đã xảy ra lỗi khi tính toán: ${error.message}. Vui lòng thử lại.`);
        }
    });

    // --- Lịch sử (Tích hợp MongoDB) ---
    async function loadHistory() {
        console.log('Đang tải lịch sử từ server. Trang:', currentHistoryPage);
        try {
            const response = await fetch(`/history?page=${currentHistoryPage}&limit=${ITEMS_PER_PAGE}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Không thể tải lịch sử từ server.');
            }
            const data = await response.json();
            historyData = data.history;
            const totalItems = data.total_items;
            const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

            console.log('Lịch sử đã tải:', historyData, 'Tổng số mục:', totalItems, 'Tổng số trang:', totalPages);

            historyListContainer.innerHTML = '';
            noHistoryMessage.style.display = historyData.length === 0 ? 'block' : 'none';

            historyData.forEach((entry, index) => {
                const card = document.createElement('div');
                card.className = 'card shadow-sm mb-3';
                card.innerHTML = `
                    <div class="card-header bg-light d-flex justify-content-between align-items-center">
                        <button class="btn btn-link fw-bold text-dark-blue text-decoration-none" type="button" data-bs-toggle="collapse" data-bs-target="#historyCollapse${entry._id}" aria-expanded="false" aria-controls="historyCollapse${entry._id}">
                            <i class="bi bi-chevron-down me-2"></i> Kết quả lúc ${entry.timestamp}
                        </button>
                        <span class="badge bg-primary">Khuyến nghị: ${entry.best_brand}</span>
                    </div>
                    <div class="collapse" id="historyCollapse${entry._id}">
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">Trọng số tiêu chí:</h6>
                            <ul class="list-group list-group-flush mb-3">
                                ${entry.criteria_weights.map((weight, i) => `<li class="list-group-item d-flex justify-content-between align-items-center py-1"><span>${criteriaLabels[i]}:</span> <span class="badge bg-info">${(parseFloat(weight) * 100).toFixed(2)}%</span></li>`).join('')}
                            </ul>
                            <h6 class="card-subtitle mb-2 text-muted">Điểm số thương hiệu:</h6>
                            <ul class="list-group list-group-flush">
                                ${entry.final_brand_scores.map(bs => `<li class="list-group-item d-flex justify-content-between align-items-center py-1"><span>${bs[0]}:</span> <span class="badge bg-success">${parseFloat(bs[1]).toFixed(4)}</span></li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `;
                historyListContainer.appendChild(card);
            });

            renderPagination(totalPages, currentHistoryPage);

        } catch (error) {
            console.error('Lỗi khi tải lịch sử:', error);
            historyListContainer.innerHTML = `
                <div class="alert alert-danger d-flex align-items-center" role="alert">
                    <i class="bi bi-x-circle-fill flex-shrink-0 me-2"></i>
                    <div>${error.message}</div>
                </div>
            `;
            noHistoryMessage.style.display = 'none';
            renderPagination(0, 0);
        }
    }

    async function clearHistory() {
        console.log('Nút "Xóa lịch sử" được nhấn.');
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử không? Hành động này không thể hoàn tác!')) {
            try {
                const data = await postData('/clear_history', {});
                alert(data.message);
                currentHistoryPage = 1;
                loadHistory();
            } catch (error) {
                console.error('Lỗi khi xóa lịch sử:', error);
                alert(`Đã xảy ra lỗi khi xóa lịch sử: ${error.message}.`);
            }
        }
    }

    // --- Xử lý nút Xuất Excel ---
    exportExcelBtn.addEventListener('click', () => {
        console.log('Nút "Xuất Excel" được nhấn.');
        window.open('/export_excel', '_blank');
    });

    // --- Xử lý nút Xuất PDF ---
    exportPdfBtn.addEventListener('click', () => {
        console.log('Nút "Xuất PDF" được nhấn.');
        window.open('/export_pdf', '_blank');
    });

    function renderPagination(totalPages, currentPage) {
        console.log('Đang render phân trang. Tổng trang:', totalPages, 'Trang hiện tại:', currentPage);
        historyPagination.innerHTML = '';

        if (totalPages <= 1 && historyData.length === 0) { 
            historyPagination.style.display = 'none';
            return;
        } else {
            historyPagination.style.display = 'flex';
        }

        const prevItem = document.createElement('li');
        prevItem.classList.add('page-item');
        if (currentPage === 1) prevItem.classList.add('disabled');
        prevItem.innerHTML = `<a class="page-link" href="#" aria-label="Trước">Trước</a>`;
        prevItem.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentHistoryPage--;
                loadHistory();
            }
        });
        historyPagination.appendChild(prevItem);

        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.addEventListener('click', (e) => {
                e.preventDefault();
                currentHistoryPage = i;
                loadHistory();
            });
            historyPagination.appendChild(li);
        }

        const nextItem = document.createElement('li');
        nextItem.classList.add('page-item');
        if (currentPage === totalPages || totalPages === 0) nextItem.classList.add('disabled');
        nextItem.innerHTML = `<a class="page-link" href="#" aria-label="Sau">Sau</a>`;
        nextItem.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < totalPages) {
                currentHistoryPage++;
                loadHistory();
            }
        });
        historyPagination.appendChild(nextItem);
    }

    loadHistoryBtn.addEventListener('click', loadHistory);
    clearHistoryBtn.addEventListener('click', clearHistory);

    loadHistory();

    criteriaLabels.forEach((criterion, index) => {
        const tableId = `brandTable_${index}`;
        const tableElement = document.getElementById(tableId);
        if (tableElement) {
            const inputs = tableElement.querySelectorAll('.ahp-input');
            inputs.forEach(input => {
                const row = parseInt(input.dataset.row);
                const col = parseInt(input.dataset.col);
                if (row === col) {
                    input.value = 1;
                    input.disabled = true;
                } else if (row > col) {
                    input.disabled = true;
                } else {
                    input.value = 1;
                    input.disabled = false;
                }
                brandsComparisonMatrices[index][row][col] = parseFloat(input.value);
            });
        }
    });

    document.getElementById('criteria-evaluation').classList.add('active');
    document.querySelector('a[data-section="criteria-evaluation"]').classList.add('active');

});
