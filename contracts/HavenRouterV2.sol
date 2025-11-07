// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPancakeRouter {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

interface IBondingCurve {
    function buy(uint256 xTokenAmount, uint256 minTokensOut) external;
    function sell(uint256 tokenAmount, uint256 minXTokenOut) external;
    function previewBuy(uint256 xTokenAmount) external view returns (uint256 tokensOut, uint256 feeXToken);
    function previewSell(uint256 tokenAmount) external view returns (uint256 xTokenOut, uint256 feeXToken);
    function isGraduated() external view returns (bool);
}

/**
 * @title HavenRouterV2
 * @notice Enhanced router with fee-on-transfer token support and batch operations
 * @dev Supports single and batched trades with automatic approvals
 */
contract HavenRouterV2 {
    // ============================================
    // STATE VARIABLES
    // ============================================

    address public pancakeRouter;
    address public havenToken;
    address public wbnb;
    address public owner;

    // Configurable parameters
    uint256 public defaultDeadlineOffset = 300; // 5 minutes
    uint256 public maxSlippageBps = 5000; // 50% max slippage

    // Emergency controls
    bool public paused;

    // ============================================
    // EVENTS
    // ============================================

    event BuyExecuted(
        address indexed user,
        address indexed token,
        uint256 inputAmount,
        uint256 tokensOut,
        string inputCurrency
    );

    event SellExecuted(
        address indexed user,
        address indexed token,
        uint256 tokensIn,
        uint256 outputAmount,
        string outputCurrency
    );

    event BatchTradeExecuted(
        address indexed user,
        uint256 tradesCount
    );

    event ConfigUpdated(
        address indexed updater,
        string parameter,
        uint256 oldValue,
        uint256 newValue
    );

    event AddressUpdated(
        address indexed updater,
        string parameter,
        address oldAddress,
        address newAddress
    );

    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    // ============================================
    // ERRORS
    // ============================================

    error Paused();
    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error SlippageExceeded();
    error InsufficientOutput();
    error TransferFailed();
    error InvalidSlippage();
    error ApproveFailed();

    // ============================================
    // MODIFIERS
    // ============================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(
        address _pancakeRouter,
        address _havenToken,
        address _wbnb
    ) {
        if (_pancakeRouter == address(0)) revert InvalidAddress();
        if (_havenToken == address(0)) revert InvalidAddress();
        if (_wbnb == address(0)) revert InvalidAddress();

        pancakeRouter = _pancakeRouter;
        havenToken = _havenToken;
        wbnb = _wbnb;
        owner = msg.sender;
    }

    // ============================================
    // INTERNAL HELPERS
    // ============================================

    /**
     * @notice Smart approval - only approves if allowance is insufficient
     * @dev Approves max uint256 on first call, skips on subsequent calls to save gas
     */
    function _ensureApproval(address token, address spender, uint256 amount) internal {
        uint256 currentAllowance = IERC20(token).allowance(address(this), spender);
        if (currentAllowance < amount) {
            // Approve unlimited to save gas on future calls
            IERC20(token).approve(spender, type(uint256).max);
        }
    }

    // ============================================
    // BATCH FUNCTIONS (Approve + Buy/Sell in one TX)
    // ============================================

    /**
     * @notice Buy graduated token with HAVEN (approve + buy in one tx)
     * @dev Handles user approval and swap in single transaction
     */
    function batchBuyGraduatedWithHAVEN(
        address token,
        uint256 havenAmount,
        uint256 minTokensOut
    ) external whenNotPaused returns (uint256 tokensOut) {
        if (token == address(0)) revert InvalidAddress();
        if (havenAmount == 0) revert InvalidAmount();

        // Transfer HAVEN from user
        IERC20(havenToken).transferFrom(msg.sender, address(this), havenAmount);

        // Smart approval (only approves if needed)
        _ensureApproval(havenToken, pancakeRouter, havenAmount);

        // Swap HAVEN -> Token (fee-supporting)
        address[] memory path = new address[](2);
        path[0] = havenToken;
        path[1] = token;

        uint256 balanceBefore = IERC20(token).balanceOf(msg.sender);

        IPancakeRouter(pancakeRouter).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            havenAmount,
            minTokensOut,
            path,
            msg.sender,
            block.timestamp + defaultDeadlineOffset
        );

        tokensOut = IERC20(token).balanceOf(msg.sender) - balanceBefore;
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        emit BuyExecuted(msg.sender, token, havenAmount, tokensOut, "HAVEN");
        return tokensOut;
    }

    /**
     * @notice Sell graduated token for HAVEN (approve + sell in one tx)
     * @dev Handles user approval and swap in single transaction, supports fee-on-transfer tokens
     */
    function batchSellGraduatedForHAVEN(
        address token,
        uint256 tokenAmount,
        uint256 minHavenOut
    ) external whenNotPaused returns (uint256 havenOut) {
        if (token == address(0)) revert InvalidAddress();
        if (tokenAmount == 0) revert InvalidAmount();

        // Transfer tokens from user and check actual received amount
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 tokensReceived = balanceAfter - balanceBefore;

        if (tokensReceived == 0) revert InvalidAmount();

        // Smart approval (only approves if needed)
        _ensureApproval(token, pancakeRouter, tokensReceived);

        // Swap Token -> HAVEN (fee-supporting)
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = havenToken;

        uint256 havenBalanceBefore = IERC20(havenToken).balanceOf(msg.sender);

        IPancakeRouter(pancakeRouter).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            tokensReceived,
            minHavenOut,
            path,
            msg.sender,
            block.timestamp + defaultDeadlineOffset
        );

        havenOut = IERC20(havenToken).balanceOf(msg.sender) - havenBalanceBefore;
        if (havenOut < minHavenOut) revert SlippageExceeded();

        emit SellExecuted(msg.sender, token, tokenAmount, havenOut, "HAVEN");
        return havenOut;
    }

    /**
     * @notice Buy bonding curve token with HAVEN (approve + buy in one tx)
     */
    function batchBuyBondingCurveWithHAVEN(
        address bondingCurveToken,
        uint256 havenAmount,
        uint256 minTokensOut
    ) external whenNotPaused returns (uint256 tokensOut) {
        if (bondingCurveToken == address(0)) revert InvalidAddress();
        if (havenAmount == 0) revert InvalidAmount();

        // Transfer HAVEN from user
        IERC20(havenToken).transferFrom(msg.sender, address(this), havenAmount);

        // Smart approval (only approves if needed)
        _ensureApproval(havenToken, bondingCurveToken, havenAmount);

        // Buy on bonding curve
        IBondingCurve(bondingCurveToken).buy(havenAmount, minTokensOut);

        // Transfer tokens to user
        tokensOut = IERC20(bondingCurveToken).balanceOf(address(this));
        IERC20(bondingCurveToken).transfer(msg.sender, tokensOut);

        emit BuyExecuted(msg.sender, bondingCurveToken, havenAmount, tokensOut, "HAVEN");
        return tokensOut;
    }

    /**
     * @notice Sell bonding curve token for HAVEN (approve + sell in one tx)
     */
    function batchSellBondingCurveForHAVEN(
        address bondingCurveToken,
        uint256 tokenAmount,
        uint256 minHavenOut
    ) external whenNotPaused returns (uint256 havenOut) {
        if (bondingCurveToken == address(0)) revert InvalidAddress();
        if (tokenAmount == 0) revert InvalidAmount();

        // Transfer tokens from user
        IERC20(bondingCurveToken).transferFrom(msg.sender, address(this), tokenAmount);

        // Sell on bonding curve (no approval needed - bonding curve pulls from this contract)
        IBondingCurve(bondingCurveToken).sell(tokenAmount, minHavenOut);

        // Transfer HAVEN to user
        havenOut = IERC20(havenToken).balanceOf(address(this));
        if (havenOut < minHavenOut) revert SlippageExceeded();
        IERC20(havenToken).transfer(msg.sender, havenOut);

        emit SellExecuted(msg.sender, bondingCurveToken, tokenAmount, havenOut, "HAVEN");
        return havenOut;
    }

    /**
     * @notice Buy graduated token with BNB (multi-hop: BNB -> HAVEN -> Token)
     */
    function batchBuyGraduatedWithBNB(
        address token,
        uint256 minTokensOut
    ) external payable whenNotPaused returns (uint256 tokensOut) {
        if (token == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();

        // Multi-hop swap: BNB -> HAVEN -> Token (fee-supporting)
        address[] memory path = new address[](3);
        path[0] = wbnb;
        path[1] = havenToken;
        path[2] = token;

        uint256 balanceBefore = IERC20(token).balanceOf(msg.sender);

        IPancakeRouter(pancakeRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(
            minTokensOut,
            path,
            msg.sender,
            block.timestamp + defaultDeadlineOffset
        );

        tokensOut = IERC20(token).balanceOf(msg.sender) - balanceBefore;
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        emit BuyExecuted(msg.sender, token, msg.value, tokensOut, "BNB");
        return tokensOut;
    }

    /**
     * @notice Sell graduated token for BNB (approve + multi-hop: Token -> HAVEN -> BNB)
     */
    function batchSellGraduatedForBNB(
        address token,
        uint256 tokenAmount,
        uint256 minBNBOut
    ) external whenNotPaused returns (uint256 bnbOut) {
        if (token == address(0)) revert InvalidAddress();
        if (tokenAmount == 0) revert InvalidAmount();

        // Transfer tokens from user and check actual received amount
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 tokensReceived = balanceAfter - balanceBefore;

        if (tokensReceived == 0) revert InvalidAmount();

        // Smart approval (only approves if needed)
        _ensureApproval(token, pancakeRouter, tokensReceived);

        // Multi-hop swap: Token -> HAVEN -> BNB (fee-supporting)
        address[] memory path = new address[](3);
        path[0] = token;
        path[1] = havenToken;
        path[2] = wbnb;

        uint256 bnbBalanceBefore = msg.sender.balance;

        IPancakeRouter(pancakeRouter).swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokensReceived,
            minBNBOut,
            path,
            msg.sender,
            block.timestamp + defaultDeadlineOffset
        );

        bnbOut = msg.sender.balance - bnbBalanceBefore;
        if (bnbOut < minBNBOut) revert SlippageExceeded();

        emit SellExecuted(msg.sender, token, tokenAmount, bnbOut, "BNB");
        return bnbOut;
    }

    /**
     * @notice Buy bonding curve token with BNB (BNB -> HAVEN -> Bonding Curve)
     */
    function batchBuyBondingCurveWithBNB(
        address bondingCurveToken,
        uint256 minTokensOut
    ) external payable whenNotPaused returns (uint256 tokensOut) {
        if (bondingCurveToken == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();

        // Step 1: Swap BNB -> HAVEN
        address[] memory path = new address[](2);
        path[0] = wbnb;
        path[1] = havenToken;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).swapExactETHForTokens{value: msg.value}(
            0,
            path,
            address(this),
            block.timestamp + defaultDeadlineOffset
        );

        uint256 havenReceived = amounts[1];

        // Step 2: Buy on bonding curve
        _ensureApproval(havenToken, bondingCurveToken, havenReceived);
        IBondingCurve(bondingCurveToken).buy(havenReceived, minTokensOut);

        // Step 3: Transfer tokens to user
        tokensOut = IERC20(bondingCurveToken).balanceOf(address(this));
        if (tokensOut < minTokensOut) revert SlippageExceeded();
        IERC20(bondingCurveToken).transfer(msg.sender, tokensOut);

        emit BuyExecuted(msg.sender, bondingCurveToken, msg.value, tokensOut, "BNB");
        return tokensOut;
    }

    /**
     * @notice Sell bonding curve token for BNB (Bonding Curve -> HAVEN -> BNB)
     */
    function batchSellBondingCurveForBNB(
        address bondingCurveToken,
        uint256 tokenAmount,
        uint256 minBNBOut
    ) external whenNotPaused returns (uint256 bnbOut) {
        if (bondingCurveToken == address(0)) revert InvalidAddress();
        if (tokenAmount == 0) revert InvalidAmount();

        // Step 1: Transfer tokens and sell on bonding curve
        IERC20(bondingCurveToken).transferFrom(msg.sender, address(this), tokenAmount);
        IBondingCurve(bondingCurveToken).sell(tokenAmount, 0);

        // Step 2: Swap HAVEN -> BNB
        uint256 havenBalance = IERC20(havenToken).balanceOf(address(this));
        if (havenBalance == 0) revert InsufficientOutput();

        _ensureApproval(havenToken, pancakeRouter, havenBalance);

        address[] memory path = new address[](2);
        path[0] = havenToken;
        path[1] = wbnb;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).swapExactTokensForETH(
            havenBalance,
            minBNBOut,
            path,
            msg.sender,
            block.timestamp + defaultDeadlineOffset
        );

        bnbOut = amounts[1];
        if (bnbOut < minBNBOut) revert SlippageExceeded();

        emit SellExecuted(msg.sender, bondingCurveToken, tokenAmount, bnbOut, "BNB");
        return bnbOut;
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @notice Preview buy graduated token with HAVEN
     */
    function previewBuyGraduatedWithHAVEN(
        address token,
        uint256 havenAmount
    ) external view returns (uint256 tokensOut) {
        address[] memory path = new address[](2);
        path[0] = havenToken;
        path[1] = token;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).getAmountsOut(havenAmount, path);
        tokensOut = amounts[1];
        return tokensOut;
    }

    /**
     * @notice Preview sell graduated token for HAVEN
     */
    function previewSellGraduatedForHAVEN(
        address token,
        uint256 tokenAmount
    ) external view returns (uint256 havenOut) {
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = havenToken;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).getAmountsOut(tokenAmount, path);
        havenOut = amounts[1];
        return havenOut;
    }

    /**
     * @notice Preview buy graduated token with BNB
     */
    function previewBuyGraduatedWithBNB(
        address token,
        uint256 bnbAmount
    ) external view returns (uint256 tokensOut) {
        address[] memory path = new address[](3);
        path[0] = wbnb;
        path[1] = havenToken;
        path[2] = token;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).getAmountsOut(bnbAmount, path);
        tokensOut = amounts[2];
        return tokensOut;
    }

    /**
     * @notice Preview sell graduated token for BNB
     */
    function previewSellGraduatedForBNB(
        address token,
        uint256 tokenAmount
    ) external view returns (uint256 bnbOut) {
        address[] memory path = new address[](3);
        path[0] = token;
        path[1] = havenToken;
        path[2] = wbnb;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).getAmountsOut(tokenAmount, path);
        bnbOut = amounts[2];
        return bnbOut;
    }

    /**
     * @notice Preview buy bonding curve token with HAVEN
     */
    function previewBuyBondingCurveWithHAVEN(
        address bondingCurveToken,
        uint256 havenAmount
    ) external view returns (uint256 tokensOut) {
        (tokensOut, ) = IBondingCurve(bondingCurveToken).previewBuy(havenAmount);
        return tokensOut;
    }

    /**
     * @notice Preview sell bonding curve token for HAVEN
     */
    function previewSellBondingCurveForHAVEN(
        address bondingCurveToken,
        uint256 tokenAmount
    ) external view returns (uint256 havenOut) {
        (havenOut, ) = IBondingCurve(bondingCurveToken).previewSell(tokenAmount);
        return havenOut;
    }

    /**
     * @notice Preview buy bonding curve token with BNB
     */
    function previewBuyBondingCurveWithBNB(
        address bondingCurveToken,
        uint256 bnbAmount
    ) external view returns (uint256 tokensOut, uint256 havenAmount) {
        // Get HAVEN for BNB
        address[] memory path = new address[](2);
        path[0] = wbnb;
        path[1] = havenToken;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).getAmountsOut(bnbAmount, path);
        havenAmount = amounts[1];

        // Get tokens from bonding curve
        (tokensOut, ) = IBondingCurve(bondingCurveToken).previewBuy(havenAmount);
        return (tokensOut, havenAmount);
    }

    /**
     * @notice Preview sell bonding curve token for BNB
     */
    function previewSellBondingCurveForBNB(
        address bondingCurveToken,
        uint256 tokenAmount
    ) external view returns (uint256 bnbOut, uint256 havenAmount) {
        // Get HAVEN from bonding curve
        (havenAmount, ) = IBondingCurve(bondingCurveToken).previewSell(tokenAmount);

        // Get BNB for HAVEN
        address[] memory path = new address[](2);
        path[0] = havenToken;
        path[1] = wbnb;

        uint256[] memory amounts = IPancakeRouter(pancakeRouter).getAmountsOut(havenAmount, path);
        bnbOut = amounts[1];
        return (bnbOut, havenAmount);
    }

    // ============================================
    // CONFIGURATION FUNCTIONS
    // ============================================

    function setPancakeRouter(address _pancakeRouter) external onlyOwner {
        if (_pancakeRouter == address(0)) revert InvalidAddress();
        emit AddressUpdated(msg.sender, "pancakeRouter", pancakeRouter, _pancakeRouter);
        pancakeRouter = _pancakeRouter;
    }

    function setHavenToken(address _havenToken) external onlyOwner {
        if (_havenToken == address(0)) revert InvalidAddress();
        emit AddressUpdated(msg.sender, "havenToken", havenToken, _havenToken);
        havenToken = _havenToken;
    }

    function setWBNB(address _wbnb) external onlyOwner {
        if (_wbnb == address(0)) revert InvalidAddress();
        emit AddressUpdated(msg.sender, "wbnb", wbnb, _wbnb);
        wbnb = _wbnb;
    }

    function setDefaultDeadlineOffset(uint256 _offset) external onlyOwner {
        emit ConfigUpdated(msg.sender, "defaultDeadlineOffset", defaultDeadlineOffset, _offset);
        defaultDeadlineOffset = _offset;
    }

    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        emit ConfigUpdated(msg.sender, "maxSlippageBps", maxSlippageBps, _maxSlippageBps);
        maxSlippageBps = _maxSlippageBps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit AddressUpdated(msg.sender, "owner", owner, newOwner);
        owner = newOwner;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    // ============================================
    // EMERGENCY FUNCTIONS
    // ============================================

    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();

        if (token == address(0)) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            bool success = IERC20(token).transfer(to, amount);
            if (!success) revert TransferFailed();
        }

        emit EmergencyWithdraw(token, to, amount);
    }

    receive() external payable {}
}
