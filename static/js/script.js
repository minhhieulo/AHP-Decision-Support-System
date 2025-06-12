document.addEventListener('DOMContentLoaded', function() {
    // Các biến danh sách tiêu chí và thương hiệu được lấy từ Flask thông qua config.js
    const criteriaLabels = typeof criteria_list !== 'undefined' ? criteria_list : ["Tiêu chí 1", "Tiêu chí 2", "Tiêu chí 3"];
    const brandLabels = typeof brands_list !== 'undefined' ? brands_list : ["Thương hiệu A", "Thương hiệu B", "Thương hiệu C"];

    let brandsChartInstance = null;
    let criteriaChartInstance = null; // This was not used for the bar chart, but for consistency if needed
    let criteriaPieChartInstance = null;

    let historyData = []; 
    let currentHistoryPage = 1;
    const ITEMS_PER_PAGE = 5;

    // Cache các phần tử DOM
    const criteriaTable = document.getElementById('criteriaTable');
    const brandComparisonSection = document.getElementById('brandComparisonSection');
    const checkCriteriaConsistencyBtn = document.getElementById('checkCriteriaConsistencyBtn');
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
    const historyPagination = document.getElementById('historyPagination');
    const noHistoryMessage = document.getElementById('noHistoryMessage');

    // Cache DOM elements for export buttons in results section
    const exportResultsExcelBtn = document.getElementById('exportResultsExcelBtn');
    const exportResultsPdfBtn = document.getElementById('exportResultsPdfBtn');

    // Cache các phần tử DOM cho CI, Lambda Max, và hộp chi tiết của tiêu chí
    const displayCR = document.getElementById('displayCR');
    const displayCRMessage = document.getElementById('displayCRMessage');
    const displayCI = document.getElementById('displayCI');
    const displayLambdaMax = document.getElementById('displayLambdaMax');
    const consistencyDetailBox = document.getElementById('consistencyDetailBox');
    // Cache các phần tử DOM cho bảng chi tiết của tiêu chí
    const detailedConsistencyTableContainer = document.getElementById('detailedConsistencyTableContainer');
    const detailedConsistencyTableBody = document.querySelector('#detailedConsistencyTable tbody');

    // Element to display consolidated brand weights per criterion (table)
    const consolidatedBrandWeightsTable = document.getElementById('consolidatedBrandWeightsTable');


    // Message container for user feedback
    const messageContainer = document.createElement('div');
    messageContainer.id = 'appMessageContainer';
    messageContainer.style.position = 'fixed';
    messageContainer.style.top = '10px';
    messageContainer.style.right = '10px';
    messageContainer.style.zIndex = '1050';
    document.body.appendChild(messageContainer);

    // Các input file cho việc nhập liệu
    const importCriteriaFile = document.getElementById('importCriteriaFile');
    const importBrandFiles = {}; 

    // Khởi tạo brandsComparisonMatrices với giá trị mặc định 1
    const brandsComparisonMatrices = Array(criteriaLabels.length).fill(null).map(() => {
        return Array(brandLabels.length).fill(null).map(() => Array(brandLabels.length).fill(1));
    });

    let calculatedCriteriaWeights = [];
    let finalCalculatedBrandScores = []; // Store final brand scores for export
    let currentCriteriaCR = 0; // Store current criteria CR for export
    let currentCriteriaCI = 0; // Store current criteria CI for export
    let currentCriteriaLambdaMax = 0; // Store current criteria Lambda Max for export
    let currentCriteriaConsistent = false; // Store current criteria consistency for export

    // NEW: Biến toàn cục để lưu trữ brand_weights_per_criterion sau khi tính toán
    let lastCalculatedBrandWeightsPerCriterion = {};
    // NEW: Biến toàn cục để lưu trữ raw criteria matrix và raw brand matrices
    let currentCriteriaMatrixRaw = null;
    let currentBrandMatricesRaw = {};

    // Biến trạng thái để theo dõi tính nhất quán
    let isCriteriaMatrixConsistent = false;
    // Mảng để theo dõi tính nhất quán của từng ma trận thương hiệu (theo thứ tự index tiêu chí)
    let brandMatricesConsistencyStatus = Array(criteriaLabels.length).fill(false);

    // --- Hàm hiển thị thông báo ---
    function showMessage(message, type = 'success') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.setAttribute('role', 'alert');
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        messageContainer.appendChild(alertDiv);
        // Remove alert after 5 seconds
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }

    // --- Hàm kiểm tra trạng thái sẵn sàng của nút "Tính toán và Đưa ra Khuyến nghị" ---
    function checkOverallCalculationReadiness() {
        const allBrandsConsistent = brandMatricesConsistencyStatus.every(status => status === true);
        if (isCriteriaMatrixConsistent && allBrandsConsistent) {
            calculateBtn.disabled = false;
        } else {
            calculateBtn.disabled = true;
        }
    }

    // --- Hàm cập nhật icon trên nút tiêu chí ---
    function updateCriterionButtonIcon(criterionIndex, isConsistent) {
        const button = document.querySelector(`.criterion-select-btn[data-criterion-index="${criterionIndex}"]`);
        if (button) {
            const iconSpan = button.querySelector('.consistency-icon');
            if (iconSpan) {
                if (isConsistent) {
                    iconSpan.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>';
                    iconSpan.style.display = 'inline';
                } else {
                    iconSpan.innerHTML = '';
                    iconSpan.style.display = 'none';
                }
            }
        }
    }

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
                // Đặt giá trị rỗng để buộc người dùng nhập liệu
                input.value = ''; 
                input.disabled = false;
            }
            input.removeEventListener('input', handleMatrixInputChange);
            input.addEventListener('input', handleMatrixInputChange);
        });
    }

    // Hàm cập nhật ma trận trên giao diện từ dữ liệu nhập
    function updateMatrixUI(tableId, matrixData, labelsLength) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const inputs = table.querySelectorAll('.ahp-input');
        
        // Xóa tất cả các trạng thái is-invalid trước khi cập nhật UI
        inputs.forEach(input => input.classList.remove('is-invalid'));

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
        const input = event.target;
        const row = parseInt(input.dataset.row);
        const col = parseInt(input.dataset.col);
        const tableId = input.closest('table').id;
        const labelsLength = (tableId === 'criteriaTable') ? criteriaLabels.length : brandLabels.length;
        const inputs = input.closest('table').querySelectorAll('.ahp-input');

        // Xóa class is-invalid ngay khi người dùng bắt đầu nhập
        input.classList.remove('is-invalid');

        // Chỉ xử lý cho các ô có thể chỉnh sửa (hàng < cột)
        if (row < col) {
            let value = parseFloat(input.value);

            // If input is empty or not a valid number
            if (input.value.trim() === '' || isNaN(value)) {
                input.classList.add('is-invalid');
                showMessage('Giá trị không hợp lệ. Vui lòng nhập một số.', 'danger');
                const inverseInput = inputs[col * labelsLength + row];
                if (inverseInput) {
                    inverseInput.value = ''; // Clear inverse as well
                }
            } else if (value <= 0 || value > 9) { // Check for range 1-9, excluding 0 and negative
                input.classList.add('is-invalid');
                showMessage('Giá trị phải nằm trong khoảng từ 1 đến 9.', 'danger');
                const inverseInput = inputs[col * labelsLength + row];
                if (inverseInput) {
                    inverseInput.value = ''; // Clear inverse as well
                }
            } else { // Valid input
                input.classList.remove('is-invalid');
                // Update inverse value
                const inverseInput = inputs[col * labelsLength + row];
                if (inverseInput) {
                    inverseInput.value = (1 / value).toFixed(2);
                }
            }
        } else if (row === col) {
            // Các ô đường chéo chính luôn là 1 và bị vô hiệu hóa
            input.value = 1;
        } else { // row > col, các ô nghịch đảo, giá trị được đặt bởi ô đối xứng
            // Không cần xử lý input trực tiếp ở đây, chỉ đảm bảo chúng bị vô hiệu hóa
            input.disabled = true;
        }

        // Khi input thay đổi, reset trạng thái kiểm tra nhất quán cho ma trận liên quan
        if (tableId === 'criteriaTable') {
            checkCriteriaConsistencyBtn.classList.remove('btn-success', 'btn-danger');
            checkCriteriaConsistencyBtn.classList.add('btn-primary');
            isCriteriaMatrixConsistent = false; // Reset consistency for criteria matrix
            // Vô hiệu hóa tất cả các nút chọn tiêu chí so sánh thương hiệu
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.disabled = true;
                updateCriterionButtonIcon(parseInt(btn.dataset.criterionIndex), false); // Ẩn icon
            });
            // Vô hiệu hóa nút Calculate
            checkOverallCalculationReadiness();
        } else { // Đối với bảng so sánh thương hiệu
            const criterionIndex = parseInt(tableId.split('_')[1]);
            const brandCheckBtn = document.querySelector(`.check-brand-consistency-btn[data-criterion-index="${criterionIndex}"]`);
            if (brandCheckBtn) {
                brandCheckBtn.classList.remove('btn-success', 'btn-danger');
                brandCheckBtn.classList.add('btn-info');
            }
            brandMatricesConsistencyStatus[criterionIndex] = false; // Reset consistency for this brand matrix
            updateCriterionButtonIcon(criterionIndex, false);
            // Vô hiệu hóa các nút tiêu chí tiếp theo và nút Calculate
            for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                if (btn) {
                    btn.disabled = true;
                    updateCriterionButtonIcon(i, false);
                }
                brandMatricesConsistencyStatus[i] = false;
            }
            checkOverallCalculationReadiness();
        }
    }

    initializeMatrix('criteriaTable', criteriaLabels);

    // --- Hàm đọc ma trận từ DOM (ĐÃ SỬA LỖI) ---
    function getMatrix(tableId, labelsLength) {
        const matrix = Array(labelsLength).fill(null).map(() => Array(labelsLength).fill(0)); // Initialize with 0s
        const inputs = document.getElementById(tableId).querySelectorAll('.ahp-input');
        let allInputsValid = true;
        let errorMessage = '';
        let firstInvalidInput = null;

        inputs.forEach(input => input.classList.remove('is-invalid')); // Clear previous invalid states

        for (let i = 0; i < labelsLength; i++) {
            for (let j = 0; j < labelsLength; j++) {
                if (i === j) {
                    matrix[i][j] = 1;
                } else if (i < j) { // Upper triangle: user editable
                    const input = inputs[i * labelsLength + j];
                    let value = parseFloat(input.value);

                    if (input.value.trim() === '' || isNaN(value)) {
                        allInputsValid = false;
                        errorMessage = `Giá trị tại hàng ${i + 1}, cột ${j + 1} không hợp lệ hoặc để trống. Vui lòng nhập số.`;
                        input.classList.add('is-invalid');
                        if (!firstInvalidInput) firstInvalidInput = input;
                    } else if (value <= 0 || value > 9) { // Explicitly check range 1-9
                        allInputsValid = false;
                        errorMessage = `Giá trị tại hàng ${i + 1}, cột ${j + 1} phải nằm trong khoảng từ 1 đến 9.`;
                        input.classList.add('is-invalid');
                        if (!firstInvalidInput) firstInvalidInput = input;
                    } else {
                        matrix[i][j] = value;
                    }
                } else { // Lower triangle: calculate inverse from already populated symmetric value
                    // This relies on (j,i) being processed before (i,j) which is true for i>j.
                    // The value matrix[j][i] should already be valid from the i<j loop.
                    if (matrix[j][i] === 0 || isNaN(matrix[j][i]) || !isFinite(matrix[j][i])) {
                         // This would only happen if the input at (j,i) was invalid and `handleMatrixInputChange`
                         // somehow didn't prevent it, or if it was cleared. This is a fallback error.
                         allInputsValid = false;
                         errorMessage = `Lỗi nội bộ: Giá trị đối xứng tại hàng ${j + 1}, cột ${i + 1} không hợp lệ.`;
                         const currentInput = inputs[i * labelsLength + j]; // This is the disabled input
                         if (currentInput) {
                             currentInput.classList.add('is-invalid');
                             if (!firstInvalidInput) firstInvalidInput = currentInput;
                         }
                         matrix[i][j] = 0; // Assign a placeholder invalid value
                    } else {
                        matrix[i][j] = 1 / matrix[j][i];
                    }
                }
                // If an error is found in the current row, no need to continue for this row's columns
                // Only break inner loop if `allInputsValid` is false AND we've already found the first invalid input.
                // This ensures all inputs in the current row get marked visually.
                if (!allInputsValid && firstInvalidInput && j === labelsLength -1) { // If last column in row and error found
                    break;
                }
            }
            if (!allInputsValid && firstInvalidInput) { // If an error is detected for the current matrix
                 break; // Break outer loop as well
            }
        }

        if (!allInputsValid) {
            showMessage(errorMessage, 'danger');
            if (firstInvalidInput) {
                firstInvalidInput.focus();
            }
            return null;
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

    // --- Hàm cập nhật bảng chi tiết nhất quán (tổng quát) ---
    function updateDetailedConsistencyTable(tableBodyElement, labels, normalizedMatrix, sumWeightsRow, weights, consistencyVector) {
        tableBodyElement.innerHTML = ''; // Xóa nội dung cũ

        for (let i = 0; i < labels.length; i++) {
            const row = document.createElement('tr');
            let rowHtml = `<td>${labels[i]}</td>`;

            // Normalized Matrix values
            for (let j = 0; j < labels.length; j++) {
                rowHtml += `<td>${normalizedMatrix[i][j].toFixed(4)}</td>`;
            }

            // Sum Weight, Trọng số PA, Consistency Vector
            rowHtml += `<td>${sumWeightsRow[i].toFixed(4)}</td>`;
            rowHtml += `<td>${weights[i].toFixed(4)}</td>`;
            rowHtml += `<td>${consistencyVector[i].toFixed(4)}</td>`;
            
            row.innerHTML = rowHtml;
            tableBodyElement.appendChild(row);
        }
    }

    // --- Hàm cập nhật kết quả nhất quán cho một ma trận cụ thể (tiêu chí hoặc thương hiệu) ---
    function updateConsistencyDisplay(
        crElement, crMessageElement, ciElement, lambdaMaxElement, consistencyBoxElement, 
        cr, ci, lambda_max, consistent, isBrandCheckBtn = false
    ) {
        // Add null checks before setting textContent or innerHTML
        if (crElement) crElement.textContent = cr.toFixed(4);
        if (ciElement) ciElement.textContent = ci.toFixed(4);
        if (lambdaMaxElement) lambdaMaxElement.textContent = lambda_max.toFixed(4);

        let message = '';
        if (consistent) {
            message = 'Đạt yêu cầu (<span class="text-success fw-bold">nhất quán</span>).';
            if (consistencyBoxElement) {
                consistencyBoxElement.classList.remove('alert-warning', 'alert-danger');
                consistencyBoxElement.classList.add('alert-success');
            }
            // Cập nhật màu nút kiểm tra nhất quán chính
            if (!isBrandCheckBtn) { // Nếu đây là nút kiểm tra tiêu chí
                checkCriteriaConsistencyBtn.classList.remove('btn-primary', 'btn-danger');
                checkCriteriaConsistencyBtn.classList.add('btn-success');
            }
        } else {
            message = 'Không đạt yêu cầu (<span class="text-danger fw-bold">không nhất quán</span>). Vui lòng điều chỉnh lại các giá trị!';
            if (consistencyBoxElement) {
                consistencyBoxElement.classList.remove('alert-success', 'alert-danger');
                consistencyBoxElement.classList.add('alert-warning');
            }
            // Cập nhật màu nút kiểm tra nhất quán chính
            if (!isBrandCheckBtn) { // Nếu đây là nút kiểm tra tiêu chí
                checkCriteriaConsistencyBtn.classList.remove('btn-primary', 'btn-success');
                checkCriteriaConsistencyBtn.classList.add('btn-danger');
            }
        }
        if (crMessageElement) crMessageElement.innerHTML = message;
        if (consistencyBoxElement) consistencyBoxElement.style.display = 'flex'; // Sử dụng flex để căn chỉnh ngang
    }


    // --- Xử lý nút "Kiểm tra nhất quán tiêu chí" ---
    checkCriteriaConsistencyBtn.addEventListener('click', async () => {
        console.log('Nút "Kiểm tra nhất quán tiêu chí" được nhấn.');
        const criteriaMatrix = getMatrix('criteriaTable', criteriaLabels.length);
        if (!criteriaMatrix) { // Nếu getMatrix trả về null do lỗi validation
            isCriteriaMatrixConsistent = false;
            checkOverallCalculationReadiness();
            return; // Dừng thực thi
        }

        try {
            const result = await postData('/check_criteria_consistency', { matrix: criteriaMatrix }); 

            const cr = result.cr;
            const ci = result.ci; 
            const lambda_max = result.lambda_max; 
            calculatedCriteriaWeights = result.weights;
            const normalizedMatrix = result.normalized_matrix; 
            const sumWeightsRow = result.sum_weights_row;     
            const consistencyVector = result.consistency_vector; 

            // Store current criteria consistency data
            currentCriteriaCR = cr;
            currentCriteriaCI = ci;
            currentCriteriaLambdaMax = lambda_max;
            currentCriteriaConsistent = result.consistent;
            currentCriteriaMatrixRaw = criteriaMatrix; // Store the raw matrix

            // Cập nhật các giá trị vào các phần tử HTML mới
            updateConsistencyDisplay(
                displayCR, displayCRMessage, displayCI, displayLambdaMax, consistencyDetailBox,
                cr, ci, lambda_max, result.consistent, false // false vì đây là nút kiểm tra tiêu chí
            );
            
            // Cập nhật bảng chi tiết
            updateDetailedConsistencyTable(detailedConsistencyTableBody, criteriaLabels, normalizedMatrix, sumWeightsRow, calculatedCriteriaWeights, consistencyVector);
            detailedConsistencyTableContainer.style.display = 'block'; // Hiển thị bảng chi tiết

            // Cập nhật trạng thái nhất quán của ma trận tiêu chí
            isCriteriaMatrixConsistent = result.consistent;
            
            // Yêu cầu 1: Hiển thị thông báo thành công
            if (isCriteriaMatrixConsistent) {
                showMessage('Tính toán nhất quán tiêu chí thành công!', 'success');
            }


            // Nếu nhất quán, cho phép chọn tiêu chí so sánh thương hiệu đầu tiên
            if (isCriteriaMatrixConsistent) {
                brandComparisonSection.classList.remove('disabled-overlay');
                // Chỉ kích hoạt nút đầu tiên
                const firstCriterionBtn = document.querySelector('.criterion-select-btn[data-criterion-index="0"]');
                if (firstCriterionBtn) {
                    firstCriterionBtn.disabled = false;
                }
                // Đảm bảo các nút còn lại vẫn bị vô hiệu hóa
                for (let i = 1; i < criteriaLabels.length; i++) {
                    const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                    if (btn) btn.disabled = true;
                }
            } else {
                brandComparisonSection.classList.add('disabled-overlay');
                criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                    btn.disabled = true;
                });
            }
            checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate
            
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
            if (consistencyDetailBox) { // Null check
                consistencyDetailBox.style.display = 'flex'; // Vẫn hiển thị hộp để báo lỗi
                consistencyDetailBox.classList.remove('alert-warning', 'alert-danger');
                consistencyDetailBox.classList.add('alert-danger');
                consistencyDetailBox.innerHTML = `
                    <i class="bi bi-exclamation-triangle-fill flex-shrink-0 me-3 fs-3 text-primary"></i>
                    <div>Lỗi: ${error.message}. Vui lòng kiểm tra lại dữ liệu nhập.</div>`;
            }
            
            if (detailedConsistencyTableContainer) detailedConsistencyTableContainer.style.display = 'none'; // Ẩn bảng chi tiết nếu có lỗi
            
            isCriteriaMatrixConsistent = false; // Đặt lại trạng thái không nhất quán
            checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate

            // Cập nhật màu nút kiểm tra nhất quán chính khi có lỗi
            checkCriteriaConsistencyBtn.classList.remove('btn-primary', 'btn-success');
            checkCriteriaConsistencyBtn.classList.add('btn-danger');

            brandComparisonSection.classList.add('disabled-overlay');
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.disabled = true;
            });
            currentCriteriaMatrixRaw = null; // Clear raw matrix on error
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
            showMessage(result.message, 'success');
            updateMatrixUI('criteriaTable', result.matrix, criteriaLabels.length);
            // Xóa file đã chọn khỏi input để có thể chọn lại cùng file
            event.target.value = ''; 
            // Sau khi nhập file, reset trạng thái nhất quán của ma trận này
            isCriteriaMatrixConsistent = false;
            checkOverallCalculationReadiness();
            // Reset màu nút kiểm tra nhất quán chính
            checkCriteriaConsistencyBtn.classList.remove('btn-success', 'btn-danger');
            checkCriteriaConsistencyBtn.classList.add('btn-primary');
            // Vô hiệu hóa tất cả các nút chọn tiêu chí so sánh thương hiệu
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.disabled = true;
                updateCriterionButtonIcon(parseInt(btn.dataset.criterionIndex), false);
            });
            // Cập nhật ma trận thô sau khi nhập file
            currentCriteriaMatrixRaw = result.matrix;
        } catch (error) {
            console.error('Lỗi khi nhập ma trận tiêu chí từ file:', error);
            showMessage(`Lỗi nhập file: ${error.message}`, 'danger');
            event.target.value = ''; // Xóa file đã chọn
            isCriteriaMatrixConsistent = false;
            checkOverallCalculationReadiness();
            // Reset màu nút kiểm tra nhất quán chính
            checkCriteriaConsistencyBtn.classList.remove('btn-success', 'btn-danger');
            checkCriteriaConsistencyBtn.classList.add('btn-primary');
            // Vô hiệu hóa tất cả các nút chọn tiêu chí so sánh thương hiệu
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.disabled = true;
                updateCriterionButtonIcon(parseInt(btn.dataset.criterionIndex), false);
            });
            currentCriteriaMatrixRaw = null; // Clear raw matrix on error
        }
    });


    // --- Xử lý các nút chọn tiêu chí để so sánh thương hiệu ---
    criterionButtonsContainer.addEventListener('click', function(event) {
        if (event.target.classList.contains('criterion-select-btn')) {
            const clickedButton = event.target;
            const criterionIndex = parseInt(clickedButton.dataset.criterionIndex);

            // Kiểm tra ràng buộc: chỉ cho phép chọn nếu nút trước đó đã nhất quán (trừ nút đầu tiên)
            if (criterionIndex > 0) {
                const prevCriterionIndex = criterionIndex - 1;
                if (!brandMatricesConsistencyStatus[prevCriterionIndex]) {
                    showMessage(`Vui lòng kiểm tra và đảm bảo ma trận cho tiêu chí "${criteriaLabels[prevCriterionIndex]}" nhất quán trước khi chuyển sang tiêu chí này.`, 'warning');
                    return; // Ngăn không cho chuyển tab
                }
            }

            console.log('Nút tiêu chí được nhấn:', clickedButton.textContent.trim());
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            clickedButton.classList.add('active');

            brandComparisonTablesContainer.querySelectorAll('.brand-comparison-table-wrapper').forEach(tableDiv => {
                tableDiv.style.display = 'none';
            });

            const targetTableWrapper = document.getElementById(`brandTableWrapper_${criterionIndex}`);
            if (targetTableWrapper) {
                targetTableWrapper.style.display = 'block';
                initializeMatrix(`brandTable_${criterionIndex}`, brandLabels);
                // Ẩn kết quả nhất quán cũ khi chuyển tiêu chí
                const brandConsistencyDetailBox = document.getElementById(`brandConsistencyDetailBox_${criterionIndex}`);
                const brandDetailedConsistencyTableContainer = document.getElementById(`brandDetailedConsistencyTableContainer_${criterionIndex}`);
                if (brandConsistencyDetailBox) brandConsistencyDetailBox.style.display = 'none';
                if (brandDetailedConsistencyTableContainer) brandDetailedConsistencyTableContainer.style.display = 'none';
            }
        }
    });

    // --- Gán sự kiện cho các input file của ma trận thương hiệu ---
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
                    showMessage(result.message, 'success');
                    updateMatrixUI(`brandTable_${criterionIndex}`, result.matrix, brandLabels.length);
                    // Cập nhật ma trận trong bộ nhớ sau khi nhập thành công
                    brandsComparisonMatrices[criterionIndex] = result.matrix;
                    // Store the raw matrix in currentBrandMatricesRaw
                    currentBrandMatricesRaw[criteriaLabels[criterionIndex]] = JSON.parse(JSON.stringify(result.matrix));

                    event.target.value = ''; // Xóa file đã chọn
                    // Sau khi nhập file, reset trạng thái nhất quán của ma trận này
                    brandMatricesConsistencyStatus[criterionIndex] = false;
                    checkOverallCalculationReadiness();
                    // Reset màu nút kiểm tra nhất quán của brand
                    const brandCheckBtn = document.querySelector(`.check-brand-consistency-btn[data-criterion-index="${criterionIndex}"]`);
                    if (brandCheckBtn) {
                        brandCheckBtn.classList.remove('btn-success', 'btn-danger');
                        brandCheckBtn.classList.add('btn-info');
                    }
                    // Sau khi nhập file, ẩn dấu tích trên nút tiêu chí tương ứng
                    updateCriterionButtonIcon(criterionIndex, false);
                    // Vô hiệu hóa các nút tiêu chí tiếp theo
                    for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                        const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                        if (btn) {
                            btn.disabled = true;
                            updateCriterionButtonIcon(i, false);
                        }
                        brandMatricesConsistencyStatus[i] = false;
                    }
                } catch (error) {
                    console.error(`Lỗi khi nhập ma trận thương hiệu cho tiêu chí ${criterionIndex} từ file:`, error);
                    showMessage(`Lỗi nhập file: ${error.message}`, 'danger');
                    event.target.value = ''; // Xóa file đã chọn
                    brandMatricesConsistencyStatus[criterionIndex] = false;
                    checkOverallCalculationReadiness();
                    // Reset màu nút kiểm tra nhất quán của brand
                    const brandCheckBtn = document.querySelector(`.check-brand-consistency-btn[data-criterion-index="${criterionIndex}"]`);
                    if (brandCheckBtn) {
                        brandCheckBtn.classList.remove('btn-success', 'btn-danger');
                        brandCheckBtn.classList.add('btn-info');
                    }
                    // Sau khi nhập file, ẩn dấu tích trên nút tiêu chí tương ứng
                    updateCriterionButtonIcon(criterionIndex, false);
                     // Vô hiệu hóa các nút tiêu chí tiếp theo
                     for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                        const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                        if (btn) {
                            btn.disabled = true;
                            updateCriterionButtonIcon(i, false);
                        }
                        brandMatricesConsistencyStatus[i] = false;
                    }
                    delete currentBrandMatricesRaw[criteriaLabels[criterionIndex]]; // Clear raw matrix on error
                }
            });
        }
    });

    // Xử lý nút "Kiểm tra nhất quán" cho từng ma trận thương hiệu
    document.querySelectorAll('.check-brand-consistency-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const criterionIndex = parseInt(event.target.dataset.criterionIndex);
            console.log(`Nút "Kiểm tra nhất quán" cho tiêu chí ${criterionIndex} được nhấn.`);
            const brandMatrix = getMatrix(`brandTable_${criterionIndex}`, brandLabels.length);
            if (!brandMatrix) { // Nếu getMatrix trả về null do lỗi validation
                brandMatricesConsistencyStatus[criterionIndex] = false; // Đặt trạng thái không nhất quán
                checkOverallCalculationReadiness(); // Cập nhật nút Calculate
                // Vô hiệu hóa các nút tiêu chí tiếp theo
                for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                    const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                    if (btn) {
                        btn.disabled = true;
                        updateCriterionButtonIcon(i, false);
                    }
                    brandMatricesConsistencyStatus[i] = false;
                }
                return; // Dừng thực thi
            }

            try {
                const result = await postData(`/check_brand_consistency/${criterionIndex}`, { matrix: brandMatrix });

                const cr = result.cr;
                const ci = result.ci;
                const lambda_max = result.lambda_max;
                const consistent = result.consistent;
                const normalizedMatrix = result.normalized_matrix;
                const sumWeightsRow = result.sum_weights_row;
                const consistencyVector = result.consistency_vector;

                const brandDisplayCR = document.getElementById(`brandDisplayCR_${criterionIndex}`);
                const brandDisplayCRMessage = document.getElementById(`brandDisplayCRMessage_${criterionIndex}`);
                const brandDisplayCI = document.getElementById(`brandDisplayCI_${criterionIndex}`);
                const brandDisplayLambdaMax = document.getElementById(`brandDisplayLambdaMax_${criterionIndex}`);
                const brandConsistencyDetailBox = document.getElementById(`brandConsistencyDetailBox_${criterionIndex}`);
                const brandDetailedConsistencyTableContainer = document.getElementById(`brandDetailedConsistencyTableContainer_${criterionIndex}`);
                const brandDetailedConsistencyTableBody = document.querySelector(`#brandDetailedConsistencyTable_${criterionIndex} tbody`);

                // Cập nhật hiển thị kết quả nhất quán
                updateConsistencyDisplay(
                    brandDisplayCR, brandDisplayCRMessage, brandDisplayCI, brandDisplayLambdaMax, brandConsistencyDetailBox,
                    cr, ci, lambda_max, consistent, true // true vì đây là nút kiểm tra brand
                );

                // Cập nhật bảng chi tiết
                updateDetailedConsistencyTable(brandDetailedConsistencyTableBody, brandLabels, normalizedMatrix, sumWeightsRow, result.weights, consistencyVector);
                if (brandDetailedConsistencyTableContainer) brandDetailedConsistencyTableContainer.style.display = 'block';

                // Cập nhật trạng thái nhất quán của ma trận thương hiệu này
                brandMatricesConsistencyStatus[criterionIndex] = consistent;
                checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate
                
                // Store the raw matrix
                currentBrandMatricesRaw[criteriaLabels[criterionIndex]] = brandMatrix;


                // Cập nhật màu nút kiểm tra brand
                if (consistent) {
                    button.classList.remove('btn-info', 'btn-danger');
                    button.classList.add('btn-success');
                    showMessage(`Ma trận thương hiệu cho tiêu chí "${criteriaLabels[criterionIndex]}" nhất quán!`, 'success');

                    // Kích hoạt nút tiêu chí tiếp theo nếu có
                    const nextCriterionButton = document.querySelector(`.criterion-select-btn[data-criterion-index="${criterionIndex + 1}"]`);
                    if (nextCriterionButton) {
                        nextCriterionButton.disabled = false;
                    }
                } else {
                    button.classList.remove('btn-info', 'btn-success');
                    button.classList.add('btn-danger');
                    showMessage(`Ma trận thương hiệu cho tiêu chí "${criteriaLabels[criterionIndex]}" không nhất quán. Vui lòng điều chỉnh!`, 'danger');
                    // Vô hiệu hóa các nút tiêu chí tiếp theo
                    for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                        const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                        if (btn) {
                            btn.disabled = true;
                            updateCriterionButtonIcon(i, false);
                        }
                        brandMatricesConsistencyStatus[i] = false;
                    }
                    delete currentBrandMatricesRaw[criteriaLabels[criterionIndex]]; // Clear raw matrix on error
                }
                // Cập nhật dấu tích trên nút tiêu chí tương ứng
                updateCriterionButtonIcon(criterionIndex, consistent);

            } catch (error) {
                console.error(`Lỗi khi kiểm tra nhất quán ma trận thương hiệu cho tiêu chí ${criterionIndex}:`, error);
                const brandConsistencyDetailBox = document.getElementById(`brandConsistencyDetailBox_${criterionIndex}`);
                const brandDetailedConsistencyTableContainer = document.getElementById(`brandDetailedConsistencyTableContainer_${criterionIndex}`);

                if (brandConsistencyDetailBox) {
                    brandConsistencyDetailBox.style.display = 'flex';
                    brandConsistencyDetailBox.classList.remove('alert-success', 'alert-warning');
                    brandConsistencyDetailBox.classList.add('alert-danger');
                    brandConsistencyDetailBox.innerHTML = `
                        <i class="bi bi-exclamation-triangle-fill flex-shrink-0 me-3 fs-3 text-primary"></i>
                        <div>Lỗi: ${error.message}. Vui lòng kiểm tra lại dữ liệu nhập.</div>`;
                }
                if (brandDetailedConsistencyTableContainer) {
                    brandDetailedConsistencyTableContainer.style.display = 'none';
                }
                
                brandMatricesConsistencyStatus[criterionIndex] = false; // Đặt lại trạng thái không nhất quán
                checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate

                // Cập nhật màu nút kiểm tra brand khi có lỗi
                button.classList.remove('btn-info', 'btn-success');
                button.classList.add('btn-danger');
                // Ẩn dấu tích trên nút tiêu chí tương ứng khi có lỗi
                updateCriterionButtonIcon(criterionIndex, false);
                // Vô hiệu hóa các nút tiêu chí tiếp theo
                for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                    const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                    if (btn) {
                        btn.disabled = true;
                        updateCriterionButtonIcon(i, false);
                    }
                    brandMatricesConsistencyStatus[i] = false;
                }
                delete currentBrandMatricesRaw[criteriaLabels[criterionIndex]]; // Clear raw matrix on error
            }
        });
    });


    // --- Xử lý sự kiện input cho các bảng so sánh thương hiệu ---
    brandComparisonTablesContainer.addEventListener('input', function(event) {
        if (event.target.classList.contains('ahp-input')) {
            const input = event.target;
            const row = parseInt(input.dataset.row);
            const col = parseInt(input.dataset.col);
            const tableId = input.closest('table').id;
            const labelsLength = (tableId === 'criteriaTable') ? criteriaLabels.length : brandLabels.length;
            const inputs = input.closest('table').querySelectorAll('.ahp-input');

            // Xóa class is-invalid ngay khi người dùng bắt đầu nhập
            input.classList.remove('is-invalid');

            // Chỉ xử lý cho các ô có thể chỉnh sửa (hàng < cột)
            if (row < col) {
                let value = parseFloat(input.value);

                // Nếu input trống hoặc không phải là số hợp lệ
                if (input.value.trim() === '' || isNaN(value)) {
                    const inverseInput = inputs[col * labelsLength + row];
                    if (inverseInput) {
                        inverseInput.value = ''; // Xóa ô nghịch đảo
                    }
                    // Không đặt giá trị mặc định ở đây. Hàm getMatrix sẽ xử lý validation đầy đủ.
                } else {
                    // Nếu là số hợp lệ, kiểm tra phạm vi 1-9
                    if (value < 1) {
                        value = 1;
                        input.value = 1;
                    } else if (value > 9) {
                        value = 9;
                        input.value = 9;
                    }
                    // Cập nhật giá trị nghịch đảo
                    const inverseInput = inputs[col * labelsLength + row];
                    if (inverseInput) {
                        inverseInput.value = (1 / value).toFixed(2);
                    }
                }
            } else if (row === col) {
                // Các ô đường chéo chính luôn là 1 và bị vô hiệu hóa
                input.value = 1;
            } else { // row > col, các ô nghịch đảo, giá trị được đặt bởi ô đối xứng
                input.disabled = true;
            }

            // Cập nhật ma trận trong bộ nhớ
            const criterionIndex = parseInt(tableId.split('_')[1]);
            brandsComparisonMatrices[criterionIndex][row][col] = parseFloat(input.value);
            brandsComparisonMatrices[criterionIndex][col][row] = 1 / parseFloat(input.value);
            console.log(`Ma trận thương hiệu cho tiêu chí ${criterionIndex} cập nhật:`, brandsComparisonMatrices[criterionIndex]);
            
            // NEW: Update the raw matrix in currentBrandMatricesRaw
            currentBrandMatricesRaw[criteriaLabels[criterionIndex]] = JSON.parse(JSON.stringify(brandsComparisonMatrices[criterionIndex]));

            // Khi người dùng thay đổi giá trị, reset trạng thái nhất quán của ma trận này
            brandMatricesConsistencyStatus[criterionIndex] = false;
            checkOverallCalculationReadiness();
            // Ẩn kết quả nhất quán cũ
            const brandConsistencyDetailBox = document.getElementById(`brandConsistencyDetailBox_${criterionIndex}`);
            const brandDetailedConsistencyTableContainer = document.getElementById(`brandDetailedConsistencyTableContainer_${criterionIndex}`);
            if (brandConsistencyDetailBox) brandConsistencyDetailBox.style.display = 'none';
            if (brandDetailedConsistencyTableContainer) brandDetailedConsistencyTableContainer.style.display = 'none';

            // Reset màu nút kiểm tra nhất quán của brand
            const brandCheckBtn = document.querySelector(`.check-brand-consistency-btn[data-criterion-index="${criterionIndex}"]`);
            if (brandCheckBtn) {
                brandCheckBtn.classList.remove('btn-success', 'btn-danger');
                brandCheckBtn.classList.add('btn-info');
            }
            // Khi thay đổi input, ẩn dấu tích trên nút tiêu chí tương ứng
            updateCriterionButtonIcon(criterionIndex, false);

            // Vô hiệu hóa các nút tiêu chí tiếp theo
            for (let i = criterionIndex + 1; i < criteriaLabels.length; i++) {
                const btn = document.querySelector(`.criterion-select-btn[data-criterion-index="${i}"]`);
                if (btn) {
                    btn.disabled = true;
                    updateCriterionButtonIcon(i, false);
                }
                brandMatricesConsistencyStatus[i] = false;
            }
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
        // Kiểm tra lại tính nhất quán lần cuối trước khi gửi yêu cầu
        if (!isCriteriaMatrixConsistent || !brandMatricesConsistencyStatus.every(status => status === true)) {
            showMessage('Vui lòng đảm bảo tất cả các ma trận (tiêu chí và thương hiệu) đều nhất quán trước khi tính toán tổng hợp!', 'warning');
            console.warn('Tính toán bị dừng: Các ma trận không nhất quán.');
            return;
        }

        const criteriaMatrix = getMatrix('criteriaTable', criteriaLabels.length);
        // Thêm kiểm tra validation cho criteriaMatrix trước khi gửi đi
        if (!criteriaMatrix) {
            // getMatrix đã hiển thị showMessage, chỉ cần return
            return;
        }
        currentCriteriaMatrixRaw = criteriaMatrix; // Store the raw criteria matrix

        const brandMatricesDataToSend = {};
        let allBrandMatricesValid = true;
        for (let i = 0; i < criteriaLabels.length; i++) {
            const currentBrandMatrix = getMatrix(`brandTable_${i}`, brandLabels.length);
            if (!currentBrandMatrix) {
                allBrandMatricesValid = false;
                // getMatrix đã hiển thị showMessage, chỉ cần break
                break; 
            }
            brandMatricesDataToSend[criteriaLabels[i]] = currentBrandMatrix;
            // Store the raw brand matrices
            currentBrandMatricesRaw[criteriaLabels[i]] = currentBrandMatrix;
        }

        if (!allBrandMatricesValid) {
            return; // Dừng nếu có lỗi trong ma trận thương hiệu
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
                if (criteriaCRSpan) criteriaCRSpan.textContent = data.criteria_cr.toFixed(4); // Null check
                const consistencyMsg = data.criteria_consistent ? '<span class="text-success fw-bold">Nhất quán (CR < 0.1)</span>' : '<span class="text-danger fw-bold">Không nhất quán (CR >= 0.1) - Vui lòng xem xét lại đánh giá của bạn!</span>';
                if (criteriaConsistencyMessage) criteriaConsistencyMessage.innerHTML = consistencyMsg; // Null check
                updateCriteriaPieChart(data.criteria_weights);

                // Update stored criteria data after successful calculation
                calculatedCriteriaWeights = data.criteria_weights;
                currentCriteriaCR = data.criteria_cr;
                currentCriteriaCI = data.criteria_ci;
                currentCriteriaLambdaMax = data.criteria_lambda_max;
                currentCriteriaConsistent = data.criteria_consistent;
            }

            lastCalculatedBrandWeightsPerCriterion = {}; // Clear previous data
            for (const criterionName in data.brand_weights_per_criterion) {
                const criterionData = data.brand_weights_per_criterion[criterionName];
                // Store this data globally for PDF export (vẫn cần để xuất PDF/Excel)
                lastCalculatedBrandWeightsPerCriterion[criterionName] = criterionData;
            }

            // Populate the consolidated brand weights table
            const consolidatedTableHead = consolidatedBrandWeightsTable.querySelector('thead tr');
            const consolidatedTableBody = consolidatedBrandWeightsTable.querySelector('tbody');
            if (consolidatedTableHead) consolidatedTableHead.innerHTML = '<th>Thương hiệu</th>'; // Reset header
            if (consolidatedTableBody) consolidatedTableBody.innerHTML = ''; // Clear previous body

            // Add criterion headers
            criteriaLabels.forEach(label => {
                if (consolidatedTableHead) { // Null check
                    const th = document.createElement('th');
                    th.textContent = label;
                    consolidatedTableHead.appendChild(th);
                }
            });

            // Add rows for each brand
            brandLabels.forEach((brand, brandIndex) => {
                const tr = document.createElement('tr');
                const th = document.createElement('th');
                th.textContent = brand;
                tr.appendChild(th);

                criteriaLabels.forEach(criterion => {
                    const td = document.createElement('td');
                    const criterionData = data.brand_weights_per_criterion[criterion];
                    if (criterionData && criterionData.weights && criterionData.weights[brandIndex] !== undefined) {
                        td.textContent = (criterionData.weights[brandIndex] * 100).toFixed(2) + '%';
                    } else {
                        td.textContent = '-'; // Or some other placeholder
                    }
                    tr.appendChild(td);
                });
                if (consolidatedTableBody) consolidatedTableBody.appendChild(tr); // Null check
            });


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
            finalCalculatedBrandScores = finalBrandScores; // Store final brand scores

            document.querySelector('a[data-section="results-charts"]').click(); // Chuyển sang tab kết quả

            loadHistory(); // Tải lại lịch sử sau khi tính toán mới

        } catch (error) {
            console.error('Lỗi khi gửi yêu cầu tính toán tổng hợp:', error);
            showMessage(`Đã xảy ra lỗi khi tính toán: ${error.message}. Vui lòng thử lại.`, 'danger');
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
                showMessage(data.message, 'success');
                currentHistoryPage = 1;
                loadHistory();
            } catch (error) {
                console.error('Lỗi khi xóa lịch sử:', error);
                showMessage(`Đã xảy ra lỗi khi xóa lịch sử: ${error.message}.`, 'danger');
            }
        }
    }

    // --- Xử lý nút Xuất Excel Kết quả hiện tại ---
    exportResultsExcelBtn.addEventListener('click', async () => {
        console.log('Nút "Xuất Excel Kết quả" được nhấn.');
        if (calculatedCriteriaWeights.length === 0 || finalCalculatedBrandScores.length === 0) {
            showMessage('Vui lòng tính toán kết quả trước khi xuất file Excel.', 'warning');
            return;
        }

        try {
            const dataToExport = {
                criteria_weights: calculatedCriteriaWeights,
                criteria_cr: currentCriteriaCR,
                criteria_ci: currentCriteriaCI,
                criteria_lambda_max: currentCriteriaLambdaMax,
                criteria_consistent: currentCriteriaConsistent,
                final_brand_scores: finalCalculatedBrandScores,
                best_brand: bestBrandElement.textContent,
                criteria_labels: criteriaLabels,
                brand_labels: brandLabels,
                brand_weights_per_criterion: lastCalculatedBrandWeightsPerCriterion,
                // NEW: Add raw matrices to dataToExport
                criteria_matrix_raw: currentCriteriaMatrixRaw,
                brand_matrices_raw: currentBrandMatricesRaw
            };

            const response = await fetch('/export_current_excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToExport)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.file_content && result.file_name) {
                    try {
                        // Giải mã Base64 và tạo Blob
                        // Đảm bảo chuỗi Base64 không có ký tự khoảng trắng nào có thể gây lỗi khi giải mã
                        const cleanBase64 = result.file_content.replace(/\s/g, ''); 
                        const byteCharacters = atob(cleanBase64); 
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                        
                        // Tạo URL và tải xuống
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = result.file_name;
                        document.body.appendChild(a);
                        a.click();
                        
                        // Thêm một độ trễ nhỏ trước khi thu hồi URL và xóa phần tử
                        // Tăng thời gian chờ lên một chút để đảm bảo trình duyệt có đủ thời gian xử lý tải xuống
                        setTimeout(() => {
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                        }, 500); // Tăng lên 500ms (0.5 giây)

                        showMessage('Xuất kết quả hiện tại ra Excel thành công!', 'success');
                    } catch (decodeError) {
                        console.error('Lỗi giải mã Base64 hoặc tạo Blob:', decodeError);
                        showMessage(`Lỗi xử lý file Excel: ${decodeError.message}. Vui lòng thử lại.`, 'danger');
                    }
                } else {
                    showMessage('Lỗi: Phản hồi từ server không chứa nội dung file hoặc tên file.', 'danger');
                }
            } else {
                const errorData = await response.json();
                showMessage(`Lỗi khi xuất Excel: ${errorData.error || 'Không thể xuất file.'}`, 'danger');
            }
        } catch (error) {
            console.error('Lỗi khi xuất Excel:', error);
            showMessage(`Đã xảy ra lỗi khi xuất file Excel: ${error.message}.`, 'danger');
        }
    });

    // --- Xử lý nút Xuất PDF Kết quả hiện tại ---
    exportResultsPdfBtn.addEventListener('click', async () => {
        console.log('Nút "Xuất PDF Kết quả" được nhấn.');
        if (calculatedCriteriaWeights.length === 0 || finalCalculatedBrandScores.length === 0) {
            showMessage('Vui lòng tính toán kết quả trước khi xuất file PDF.', 'warning');
            return;
        }

        try {
            const dataToExport = {
                criteria_weights: calculatedCriteriaWeights,
                criteria_cr: currentCriteriaCR,
                criteria_ci: currentCriteriaCI,
                criteria_lambda_max: currentCriteriaLambdaMax,
                criteria_consistent: currentCriteriaConsistent,
                final_brand_scores: finalCalculatedBrandScores,
                best_brand: bestBrandElement.textContent,
                criteria_labels: criteriaLabels,
                brand_labels: brandLabels,
                brand_weights_per_criterion: lastCalculatedBrandWeightsPerCriterion, // Gửi dữ liệu này!
                // NEW: Add raw matrices to dataToExport
                criteria_matrix_raw: currentCriteriaMatrixRaw,
                brand_matrices_raw: currentBrandMatricesRaw
            };

            // Capture chart images as base64 and their dimensions
            const criteriaPieChartCanvas = document.getElementById('criteriaPieChart');
            const brandsChartCanvas = document.getElementById('brandsChart');

            if (criteriaPieChartCanvas && criteriaPieChartInstance) {
                dataToExport.criteria_pie_chart_image = criteriaPieChartCanvas.toDataURL('image/png');
                dataToExport.criteria_pie_chart_image_width = criteriaPieChartCanvas.width; // Use .width/.height for actual canvas resolution
                dataToExport.criteria_pie_chart_image_height = criteriaPieChartCanvas.height;
            }
            if (brandsChartCanvas && brandsChartInstance) {
                dataToExport.brands_bar_chart_image = brandsChartCanvas.toDataURL('image/png');
                dataToExport.brands_bar_chart_image_width = brandsChartCanvas.width;
                dataToExport.brands_bar_chart_image_height = brandsChartCanvas.height;
            }

            const response = await fetch('/export_current_pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToExport)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'ket_qua_ahp.pdf';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                showMessage('Xuất kết quả hiện tại ra PDF thành công!', 'success');
            } else {
                const errorData = await response.json();
                showMessage(`Lỗi khi xuất PDF: ${errorData.error || 'Không thể xuất file.'}`, 'danger');
            }
        } catch (error) {
            console.error('Lỗi khi xuất PDF:', error);
            showMessage(`Đã xảy ra lỗi khi xuất file PDF: ${error.message}.`, 'danger');
        }
    });

    function renderPagination(totalPages, currentPage) {
        console.log('Đang render phân trang. Tổng trang:', totalPages, 'Trang hiện tại:', currentPage);
        if (historyPagination) historyPagination.innerHTML = ''; // Null check

        if (totalPages <= 1 && historyData.length === 0) { 
            if (historyPagination) historyPagination.style.display = 'none'; // Null check
            return;
        } else {
            if (historyPagination) historyPagination.style.display = 'flex'; // Null check
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
        if (historyPagination) historyPagination.appendChild(prevItem); // Null check

        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.addEventListener('click', (e) => {
                e.preventDefault();
                currentHistoryPage = i;
                loadHistory();
            });
        if (historyPagination) historyPagination.appendChild(li); // Null check
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
        if (historyPagination) historyPagination.appendChild(nextItem); // Null check
    }

    if (loadHistoryBtn) loadHistoryBtn.addEventListener('click', loadHistory); // Null check
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory); // Null check

    loadHistory();

    // Khởi tạo trạng thái nhất quán ban đầu cho tất cả các ma trận thương hiệu
    brandMatricesConsistencyStatus = Array(criteriaLabels.length).fill(false);
    checkOverallCalculationReadiness(); // Cập nhật trạng thái nút Calculate khi tải trang

    // Gọi initializeMatrix cho tất cả các bảng khi tải trang để đảm bảo ô trống
    initializeMatrix('criteriaTable', criteriaLabels);
    // Khởi tạo các bảng brandTable
    criteriaLabels.forEach((criterion, index) => {
        const tableId = `brandTable_${index}`;
        const tableElement = document.getElementById(tableId);
        if (tableElement) { // Ensure the table element exists
            initializeMatrix(tableId, brandLabels);
        }
    });

    // Vô hiệu hóa tất cả các nút chọn tiêu chí so sánh thương hiệu khi tải trang
    // Chúng sẽ được kích hoạt dần khi ma trận tiêu chí và các ma trận thương hiệu trước đó nhất quán
    document.querySelectorAll('.criterion-select-btn').forEach(button => {
        button.disabled = true;
        // Đảm bảo các input trong bảng thương hiệu cũng bị vô hiệu hóa ban đầu
        const criterionIndex = parseInt(button.dataset.criterionIndex);
        const tableId = `brandTable_${criterionIndex}`;
        const tableElement = document.getElementById(tableId);
        if (tableElement) {
            tableElement.querySelectorAll('.ahp-input').forEach(input => {
                input.disabled = true; // Vô hiệu hóa tất cả các ô input ban đầu
            });
        }
    });


    // Đảm bảo phần "criteria-evaluation" được hiển thị mặc định
    document.getElementById('criteria-evaluation').classList.add('active');
    document.querySelector('a[data-section="criteria-evaluation"]').classList.add('active');

});
