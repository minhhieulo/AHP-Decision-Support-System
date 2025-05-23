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
    const exportPdfBtn = document.getElementById('exportPdf');
    const historyPagination = document.getElementById('historyPagination');
    const noHistoryMessage = document.getElementById('noHistoryMessage');

    // Cache các phần tử DOM cho CI, Lambda Max, và hộp chi tiết của tiêu chí
    const displayCR = document.getElementById('displayCR');
    const displayCRMessage = document.getElementById('displayCRMessage');
    const displayCI = document.getElementById('displayCI');
    const displayLambdaMax = document.getElementById('displayLambdaMax');
    const consistencyDetailBox = document.getElementById('consistencyDetailBox');
    // Cache các phần tử DOM cho bảng chi tiết của tiêu chí
    const detailedConsistencyTableContainer = document.getElementById('detailedConsistencyTableContainer');
    const detailedConsistencyTableBody = document.querySelector('#detailedConsistencyTable tbody');


    // Các input file cho việc nhập liệu
    const importCriteriaFile = document.getElementById('importCriteriaFile');
    const importBrandFiles = {}; 

    // Khởi tạo brandsComparisonMatrices với giá trị mặc định 1
    const brandsComparisonMatrices = Array(criteriaLabels.length).fill(null).map(() => {
        return Array(brandLabels.length).fill(null).map(() => Array(brandLabels.length).fill(1));
    });

    let calculatedCriteriaWeights = [];

    // Biến trạng thái để theo dõi tính nhất quán
    let isCriteriaMatrixConsistent = false;
    // Mảng để theo dõi tính nhất quán của từng ma trận thương hiệu (theo thứ tự index tiêu chí)
    let brandMatricesConsistencyStatus = Array(criteriaLabels.length).fill(false);

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
            // Không cần xử lý input trực tiếp ở đây, chỉ đảm bảo chúng bị vô hiệu hóa
            input.disabled = true;
        }

        // Khi input thay đổi, reset trạng thái kiểm tra nhất quán cho ma trận liên quan
        if (tableId === 'criteriaTable') {
            checkCriteriaConsistencyBtn.classList.remove('btn-success', 'btn-danger');
            checkCriteriaConsistencyBtn.classList.add('btn-primary');
        } else { // Đối với bảng so sánh thương hiệu
            const criterionIndex = parseInt(tableId.split('_')[1]);
            const brandCheckBtn = document.querySelector(`.check-brand-consistency-btn[data-criterion-index="${criterionIndex}"]`);
            if (brandCheckBtn) {
                brandCheckBtn.classList.remove('btn-success', 'btn-danger');
                brandCheckBtn.classList.add('btn-info');
            }
            updateCriterionButtonIcon(criterionIndex, false);
        }
    }

    initializeMatrix('criteriaTable', criteriaLabels);

    // --- Hàm đọc ma trận từ DOM ---
    function getMatrix(tableId, labelsLength) {
        const matrix = [];
        const inputs = document.getElementById(tableId).querySelectorAll('.ahp-input');
        let allInputsValid = true;
        let errorMessage = '';
        let firstInvalidInput = null; // Để focus vào ô lỗi đầu tiên

        // Reset invalid class for all inputs in the current table
        inputs.forEach(input => input.classList.remove('is-invalid'));

        for (let i = 0; i < labelsLength; i++) {
            const row = [];
            for (let j = 0; j < labelsLength; j++) {
                const input = inputs[i * labelsLength + j];
                let value;

                // Chỉ kiểm tra các ô mà người dùng có thể chỉnh sửa (phần tam giác trên của ma trận)
                if (i < j) { 
                    if (input.value.trim() === '' || isNaN(parseFloat(input.value))) {
                        allInputsValid = false;
                        errorMessage = `Giá trị tại hàng ${i + 1}, cột ${j + 1} không hợp lệ hoặc để trống. Vui lòng nhập số.`;
                        input.classList.add('is-invalid');
                        if (!firstInvalidInput) firstInvalidInput = input;
                        break; 
                    }
                    value = parseFloat(input.value);
                    if (value < 1 || value > 9) {
                        allInputsValid = false;
                        errorMessage = `Giá trị tại hàng ${i + 1}, cột ${j + 1} phải nằm trong khoảng từ 1 đến 9.`;
                        input.classList.add('is-invalid');
                        if (!firstInvalidInput) firstInvalidInput = input;
                        break; 
                    }
                } else if (i === j) {
                    // Đường chéo chính luôn là 1 và không cần kiểm tra
                    value = 1;
                } else { // i > j, các ô nghịch đảo, giá trị đã được tính tự động từ ô đối xứng
                    value = parseFloat(input.value);
                }
                row.push(value);
            }
            if (!allInputsValid) break; 
            matrix.push(row);
        }

        if (!allInputsValid) {
            alert(errorMessage);
            if (firstInvalidInput) {
                firstInvalidInput.focus(); // Focus vào ô lỗi đầu tiên
            }
            return null; // Trả về null để báo hiệu lỗi
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
        crElement.textContent = cr.toFixed(4);
        ciElement.textContent = ci.toFixed(4);
        lambdaMaxElement.textContent = lambda_max.toFixed(4);

        let message = '';
        if (consistent) {
            message = 'Đạt yêu cầu (<span class="text-success fw-bold">nhất quán</span>).';
            consistencyBoxElement.classList.remove('alert-warning', 'alert-danger');
            consistencyBoxElement.classList.add('alert-success');
            // Cập nhật màu nút kiểm tra nhất quán chính
            if (!isBrandCheckBtn) { // Nếu đây là nút kiểm tra tiêu chí
                checkCriteriaConsistencyBtn.classList.remove('btn-primary', 'btn-danger');
                checkCriteriaConsistencyBtn.classList.add('btn-success');
            }
        } else {
            message = 'Không đạt yêu cầu (<span class="text-danger fw-bold">không nhất quán</span>). Vui lòng điều chỉnh lại các giá trị!';
            consistencyBoxElement.classList.remove('alert-success', 'alert-danger');
            consistencyBoxElement.classList.add('alert-warning');
            // Cập nhật màu nút kiểm tra nhất quán chính
            if (!isBrandCheckBtn) { // Nếu đây là nút kiểm tra tiêu chí
                checkCriteriaConsistencyBtn.classList.remove('btn-primary', 'btn-success');
                checkCriteriaConsistencyBtn.classList.add('btn-danger');
            }
        }
        crMessageElement.innerHTML = message;
        consistencyBoxElement.style.display = 'flex'; // Sử dụng flex để căn chỉnh ngang
    }


    // --- Xử lý nút "Kiểm tra nhất quán tiêu chí" ---
    checkCriteriaConsistencyBtn.addEventListener('click', async () => {
        console.log('Nút "Kiểm tra nhất quán tiêu chí" được nhấn.');
        const criteriaMatrix = getMatrix('criteriaTable', criteriaLabels.length);
        if (!criteriaMatrix) { // Nếu getMatrix trả về null do lỗi validation
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
            checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate

            // Nếu nhất quán, cho phép chọn tiêu chí so sánh thương hiệu
            if (isCriteriaMatrixConsistent) {
                brandComparisonSection.classList.remove('disabled-overlay');
                criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                    btn.disabled = false;
                });
            } else {
                brandComparisonSection.classList.add('disabled-overlay');
                criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                    btn.disabled = true;
                });
            }
            
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
            consistencyDetailBox.style.display = 'flex'; // Vẫn hiển thị hộp để báo lỗi
            consistencyDetailBox.classList.remove('alert-success', 'alert-warning');
            consistencyDetailBox.classList.add('alert-danger');
            consistencyDetailBox.innerHTML = `
                <i class="bi bi-exclamation-triangle-fill flex-shrink-0 me-2"></i>
                <div>Lỗi: ${error.message}. Vui lòng kiểm tra lại dữ liệu nhập.</div>`;
            
            detailedConsistencyTableContainer.style.display = 'none'; // Ẩn bảng chi tiết nếu có lỗi
            
            isCriteriaMatrixConsistent = false; // Đặt lại trạng thái không nhất quán
            checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate

            // Cập nhật màu nút kiểm tra nhất quán chính khi có lỗi
            checkCriteriaConsistencyBtn.classList.remove('btn-primary', 'btn-success');
            checkCriteriaConsistencyBtn.classList.add('btn-danger');

            brandComparisonSection.classList.add('disabled-overlay');
            criterionButtonsContainer.querySelectorAll('.criterion-select-btn').forEach(btn => {
                btn.disabled = true;
            });
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
            // Sau khi nhập file, reset trạng thái nhất quán của ma trận này
            isCriteriaMatrixConsistent = false;
            checkOverallCalculationReadiness();
            // Reset màu nút kiểm tra nhất quán chính
            checkCriteriaConsistencyBtn.classList.remove('btn-success', 'btn-danger');
            checkCriteriaConsistencyBtn.classList.add('btn-primary');
        } catch (error) {
            console.error('Lỗi khi nhập ma trận tiêu chí từ file:', error);
            alert(`Lỗi nhập file: ${error.message}`);
            event.target.value = ''; // Xóa file đã chọn
            isCriteriaMatrixConsistent = false;
            checkOverallCalculationReadiness();
            // Reset màu nút kiểm tra nhất quán chính
            checkCriteriaConsistencyBtn.classList.remove('btn-success', 'btn-danger');
            checkCriteriaConsistencyBtn.classList.add('btn-primary');
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

            const criterionIndex = parseInt(event.target.dataset.criterionIndex);
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
                    alert(result.message);
                    updateMatrixUI(`brandTable_${criterionIndex}`, result.matrix, brandLabels.length);
                    // Cập nhật ma trận trong bộ nhớ sau khi nhập thành công
                    brandsComparisonMatrices[criterionIndex] = result.matrix;
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
                } catch (error) {
                    console.error(`Lỗi khi nhập ma trận thương hiệu cho tiêu chí ${criterionIndex} từ file:`, error);
                    alert(`Lỗi nhập file: ${error.message}`);
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
                brandDetailedConsistencyTableContainer.style.display = 'block';

                // Cập nhật trạng thái nhất quán của ma trận thương hiệu này
                brandMatricesConsistencyStatus[criterionIndex] = consistent;
                checkOverallCalculationReadiness(); // Kiểm tra lại trạng thái nút Calculate

                // Cập nhật màu nút kiểm tra brand
                if (consistent) {
                    button.classList.remove('btn-info', 'btn-danger');
                    button.classList.add('btn-success');
                } else {
                    button.classList.remove('btn-info', 'btn-success');
                    button.classList.add('btn-danger');
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
                        <i class="bi bi-exclamation-triangle-fill flex-shrink-0 me-2"></i>
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
            alert('Vui lòng đảm bảo tất cả các ma trận (tiêu chí và thương hiệu) đều nhất quán trước khi tính toán tổng hợp!');
            console.warn('Tính toán bị dừng: Các ma trận không nhất quán.');
            return;
        }

        const criteriaMatrix = getMatrix('criteriaTable', criteriaLabels.length);
        // Thêm kiểm tra validation cho criteriaMatrix trước khi gửi đi
        if (!criteriaMatrix) {
            // getMatrix đã hiển thị alert, chỉ cần return
            return;
        }

        const brandMatricesDataToSend = {};
        let allBrandMatricesValid = true;
        for (let i = 0; i < criteriaLabels.length; i++) {
            const currentBrandMatrix = getMatrix(`brandTable_${i}`, brandLabels.length);
            if (!currentBrandMatrix) {
                allBrandMatricesValid = false;
                // getMatrix đã hiển thị alert, chỉ cần break
                break; 
            }
            brandMatricesDataToSend[criteriaLabels[i]] = currentBrandMatrix;
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
                criteriaCRSpan.textContent = data.criteria_cr.toFixed(4);
                const consistencyMsg = data.criteria_consistent ? '<span class="text-success fw-bold">Nhất quán (CR < 0.1)</span>' : '<span class="text-danger fw-bold">Không nhất quán (CR >= 0.1) - Vui lòng xem xét lại đánh giá của bạn!</span>';
                criteriaConsistencyMessage.innerHTML = consistencyMsg;
                updateCriteriaPieChart(data.criteria_weights);
            }

            // Hiển thị kết quả nhất quán cho từng ma trận thương hiệu (nếu cần, mặc dù đã hiển thị ở bước kiểm tra riêng)
            for (let i = 0; i < criteriaLabels.length; i++) {
                const criterionName = criteriaLabels[i];
                const brandCriterionData = data.brand_weights_per_criterion[criterionName];

                const brandDisplayCR = document.getElementById(`brandDisplayCR_${i}`);
                const brandDisplayCRMessage = document.getElementById(`brandDisplayCRMessage_${i}`);
                const brandDisplayCI = document.getElementById(`brandDisplayCI_${i}`);
                const brandDisplayLambdaMax = document.getElementById(`brandDisplayLambdaMax_${i}`);
                const brandConsistencyDetailBox = document.getElementById(`brandConsistencyDetailBox_${i}`);
                const brandDetailedConsistencyTableContainer = document.getElementById(`brandDetailedConsistencyTableContainer_${i}`);
                const brandDetailedConsistencyTableBody = document.querySelector(`#brandDetailedConsistencyTable_${i} tbody`);

                if (brandDisplayCR && brandConsistencyDetailBox) {
                    updateConsistencyDisplay(
                        brandDisplayCR, brandDisplayCRMessage, brandDisplayCI, brandDisplayLambdaMax, brandConsistencyDetailBox,
                        brandCriterionData.cr, brandCriterionData.ci, brandCriterionData.lambda_max, brandCriterionData.consistent, true
                    );
                }
                if (brandDetailedConsistencyTableBody && brandDetailedConsistencyTableContainer) {
                    updateDetailedConsistencyTable(
                        brandDetailedConsistencyTableBody, brandLabels, 
                        brandCriterionData.normalized_matrix, brandCriterionData.sum_weights_row, 
                        brandCriterionData.weights, brandCriterionData.consistency_vector
                    );
                    brandDetailedConsistencyTableContainer.style.display = 'block';
                }
                // Cập nhật dấu tích trên nút tiêu chí sau khi tính toán tổng hợp
                updateCriterionButtonIcon(i, brandCriterionData.consistent);
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

    // Khởi tạo trạng thái nhất quán ban đầu cho tất cả các ma trận thương hiệu
    brandMatricesConsistencyStatus = Array(criteriaLabels.length).fill(false);
    checkOverallCalculationReadiness(); // Cập nhật trạng thái nút Calculate khi tải trang

    // Gọi initializeMatrix cho tất cả các bảng khi tải trang để đảm bảo ô trống
    initializeMatrix('criteriaTable', criteriaLabels);
    criteriaLabels.forEach((criterion, index) => {
        initializeMatrix(`brandTable_${index}`, brandLabels);
    });

    document.getElementById('criteria-evaluation').classList.add('active');
    document.querySelector('a[data-section="criteria-evaluation"]').classList.add('active');

});
