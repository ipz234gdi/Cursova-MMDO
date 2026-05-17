const taskData = {
    objective: [658, 688],
    constraints: [
        [1, 1],
        [1, 0],
        [5, 8],
        [6, 4],
        [4, 2]
    ],
    bounds: [12, 18, 89, 79, 35]
};

const solver = new SimplexSolver(taskData.objective, taskData.constraints, taskData.bounds);

try {
    const result = solver.solve();
    
    console.log("Оптимальний план знайдено!");
    console.log(`Швидкі потяги (x1): ${result.optimalPlan.x1}`);
    console.log(`Пасажирські потяги (x2): ${result.optimalPlan.x2}`);
    console.log(`Кількість пасажирів (Z): ${result.maxZ}`);
    

} catch (error) {
    console.error("Помилка під час розрахунків:", error.message);
}



