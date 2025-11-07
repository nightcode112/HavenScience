
// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/access/Ownable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

pragma solidity >=0.6.2;


/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/draft-IERC6093.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/draft-IERC6093.sol)
pragma solidity >=0.8.4;

/**
 * @dev Standard ERC-20 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-20 tokens.
 */
interface IERC20Errors {
    /**
     * @dev Indicates an error related to the current `balance` of a `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param balance Current balance for the interacting account.
     * @param needed Minimum amount required to perform a transfer.
     */
    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC20InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC20InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `spender`’s `allowance`. Used in transfers.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     * @param allowance Amount of tokens a `spender` is allowed to operate with.
     * @param needed Minimum amount required to perform a transfer.
     */
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC20InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `spender` to be approved. Used in approvals.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC20InvalidSpender(address spender);
}

/**
 * @dev Standard ERC-721 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-721 tokens.
 */
interface IERC721Errors {
    /**
     * @dev Indicates that an address can't be an owner. For example, `address(0)` is a forbidden owner in ERC-20.
     * Used in balance queries.
     * @param owner Address of the current owner of a token.
     */
    error ERC721InvalidOwner(address owner);

    /**
     * @dev Indicates a `tokenId` whose `owner` is the zero address.
     * @param tokenId Identifier number of a token.
     */
    error ERC721NonexistentToken(uint256 tokenId);

    /**
     * @dev Indicates an error related to the ownership over a particular token. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param tokenId Identifier number of a token.
     * @param owner Address of the current owner of a token.
     */
    error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC721InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC721InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `operator`’s approval. Used in transfers.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     * @param tokenId Identifier number of a token.
     */
    error ERC721InsufficientApproval(address operator, uint256 tokenId);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC721InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `operator` to be approved. Used in approvals.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC721InvalidOperator(address operator);
}

/**
 * @dev Standard ERC-1155 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-1155 tokens.
 */
interface IERC1155Errors {
    /**
     * @dev Indicates an error related to the current `balance` of a `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param balance Current balance for the interacting account.
     * @param needed Minimum amount required to perform a transfer.
     * @param tokenId Identifier number of a token.
     */
    error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC1155InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC1155InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `operator`’s approval. Used in transfers.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     * @param owner Address of the current owner of a token.
     */
    error ERC1155MissingApprovalForAll(address operator, address owner);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC1155InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `operator` to be approved. Used in approvals.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC1155InvalidOperator(address operator);

    /**
     * @dev Indicates an array length mismatch between ids and values in a safeBatchTransferFrom operation.
     * Used in batch transfers.
     * @param idsLength Length of the array of token identifiers
     * @param valuesLength Length of the array of token amounts
     */
    error ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength);
}


// File @openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/extensions/IERC20Metadata.sol)

pragma solidity >=0.6.2;

/**
 * @dev Interface for the optional metadata functions from the ERC-20 standard.
 */
interface IERC20Metadata is IERC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}


// File @openzeppelin/contracts/token/ERC20/ERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/ERC20.sol)

pragma solidity ^0.8.20;




/**
 * @dev Implementation of the {IERC20} interface.
 *
 * This implementation is agnostic to the way tokens are created. This means
 * that a supply mechanism has to be added in a derived contract using {_mint}.
 *
 * TIP: For a detailed writeup see our guide
 * https://forum.openzeppelin.com/t/how-to-implement-erc20-supply-mechanisms/226[How
 * to implement supply mechanisms].
 *
 * The default value of {decimals} is 18. To change this, you should override
 * this function so it returns a different value.
 *
 * We have followed general OpenZeppelin Contracts guidelines: functions revert
 * instead returning `false` on failure. This behavior is nonetheless
 * conventional and does not conflict with the expectations of ERC-20
 * applications.
 */
abstract contract ERC20 is Context, IERC20, IERC20Metadata, IERC20Errors {
    mapping(address account => uint256) private _balances;

    mapping(address account => mapping(address spender => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /**
     * @dev Sets the values for {name} and {symbol}.
     *
     * Both values are immutable: they can only be set once during construction.
     */
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the default value returned by this function, unless
     * it's overridden.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    /// @inheritdoc IERC20
    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    /// @inheritdoc IERC20
    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `value`.
     */
    function transfer(address to, uint256 value) public virtual returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, value);
        return true;
    }

    /// @inheritdoc IERC20
    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `value` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 value) public virtual returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, value);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Skips emitting an {Approval} event indicating an allowance update. This is not
     * required by the ERC. See {xref-ERC20-_approve-address-address-uint256-bool-}[_approve].
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `value`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `value`.
     */
    function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead.
     */
    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        if (to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(from, to, value);
    }

    /**
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            _totalSupply += value;
        } else {
            uint256 fromBalance = _balances[from];
            if (fromBalance < value) {
                revert ERC20InsufficientBalance(from, fromBalance, value);
            }
            unchecked {
                // Overflow not possible: value <= fromBalance <= totalSupply.
                _balances[from] = fromBalance - value;
            }
        }

        if (to == address(0)) {
            unchecked {
                // Overflow not possible: value <= totalSupply or value <= fromBalance <= totalSupply.
                _totalSupply -= value;
            }
        } else {
            unchecked {
                // Overflow not possible: balance + value is at most totalSupply, which we know fits into a uint256.
                _balances[to] += value;
            }
        }

        emit Transfer(from, to, value);
    }

    /**
     * @dev Creates a `value` amount of tokens and assigns them to `account`, by transferring it from address(0).
     * Relies on the `_update` mechanism
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead.
     */
    function _mint(address account, uint256 value) internal {
        if (account == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(address(0), account, value);
    }

    /**
     * @dev Destroys a `value` amount of tokens from `account`, lowering the total supply.
     * Relies on the `_update` mechanism.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead
     */
    function _burn(address account, uint256 value) internal {
        if (account == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        _update(account, address(0), value);
    }

    /**
     * @dev Sets `value` as the allowance of `spender` over the `owner`'s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     *
     * Overrides to this logic should be done to the variant with an additional `bool emitEvent` argument.
     */
    function _approve(address owner, address spender, uint256 value) internal {
        _approve(owner, spender, value, true);
    }

    /**
     * @dev Variant of {_approve} with an optional flag to enable or disable the {Approval} event.
     *
     * By default (when calling {_approve}) the flag is set to true. On the other hand, approval changes made by
     * `_spendAllowance` during the `transferFrom` operation set the flag to false. This saves gas by not emitting any
     * `Approval` event during `transferFrom` operations.
     *
     * Anyone who wishes to continue emitting `Approval` events on the`transferFrom` operation can force the flag to
     * true using the following override:
     *
     * ```solidity
     * function _approve(address owner, address spender, uint256 value, bool) internal virtual override {
     *     super._approve(owner, spender, value, true);
     * }
     * ```
     *
     * Requirements are the same as {_approve}.
     */
    function _approve(address owner, address spender, uint256 value, bool emitEvent) internal virtual {
        if (owner == address(0)) {
            revert ERC20InvalidApprover(address(0));
        }
        if (spender == address(0)) {
            revert ERC20InvalidSpender(address(0));
        }
        _allowances[owner][spender] = value;
        if (emitEvent) {
            emit Approval(owner, spender, value);
        }
    }

    /**
     * @dev Updates `owner`'s allowance for `spender` based on spent `value`.
     *
     * Does not update the allowance value in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Does not emit an {Approval} event.
     */
    function _spendAllowance(address owner, address spender, uint256 value) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance < type(uint256).max) {
            if (currentAllowance < value) {
                revert ERC20InsufficientAllowance(spender, currentAllowance, value);
            }
            unchecked {
                _approve(owner, spender, currentAllowance - value, false);
            }
        }
    }
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;


/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}


// File BSC_COMPATIBLE/Interfaces.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.19;

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IUniswapV2Router {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
}

interface IUniswapV2RouterSwap {
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
    function WETH() external pure returns (address);
}

interface IBondingCurveToken {
    function transferLiquidityToUniswap() external returns (uint256, uint256);
    function setUniswapPair(address pair) external;
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}


// File BSC_COMPATIBLE/FullBondingCurveERC20WBNB.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.19;






interface IFactory {
    function graduateToken() external;
}

/**
 * @title FullBondingCurveERC20WBNB
 * @notice Bonding curve with X Token as trading pair (pre and post bonding) - WETH Compatible
 * @dev All fees collected in X Token, auto-swapped to ETH at percentage-based thresholds
 */
contract FullBondingCurveERC20WBNB is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // X Token Configuration (set by factory on deployment)
    address public X_TOKEN_ADDRESS;
    address public immutable UNISWAP_V2_ROUTER;
    address public immutable WETH;
    bool public immutable isXTokenWETH;  // True if X_TOKEN_ADDRESS == WETH

    // Bonding Curve Parameters (immutable, set at creation)
    uint256 public immutable VIRTUAL_X_TOKENS;
    uint256 public immutable VIRTUAL_PROJECT_TOKENS;
    uint256 public immutable MAX_SUPPLY;
    uint256 public immutable INITIAL_SUPPLY;
    uint256 public immutable UNISWAP_SUPPLY;
    uint256 public immutable targetXTokens;

    uint256 public preGradFactoryFee = 65;   // 0.65%
    uint256 public preGradCreatorFee = 35;   // 0.35%
    uint256 public postGradFactoryFee = 60;  // 0.6%
    uint256 public postGradCreatorFee = 40;  // 0.4%
    uint256 private constant FEE_DENOMINATOR = 10000;

    uint256 public swapThresholdBps = 10;
    uint256 public swapThresholdPostGradBps = 10;
    uint256 public constant MIN_FLOOR = 10 * 1e18;

    // State variables
    address public factory;
    address public immutable GRADUATION_HELPER;
    address public creator;
    address public creatorFeeRecipient;  // Where creator fees are sent
    uint256 public poolBalanceXToken;
    bool public isGraduated;
    address public uniswapV2Pair;
    uint256 public totalTx;

    // Fee tracking
    uint256 public pendingFactoryFeesXToken;   // X Token fees before swap
    uint256 public pendingCreatorFeesXToken;   // X Token fees before swap (post-grad only)
    uint256 public pendingFactoryFees;         // ETH fees after swap
    uint256 public pendingCreatorFees;         // ETH fees after swap

    // Post-grad fee tracking (PROJECT tokens accumulated before swap)
    uint256 public pendingFactoryTokenFees;   // PROJECT tokens to swap
    uint256 public pendingCreatorTokenFees;   // PROJECT tokens to swap

    // Lifetime tracking (since launch)
    uint256 public totalFactoryFeesCollected;  // Total factory fees collected in BNB (ETH)
    uint256 public totalCreatorFeesCollected;  // Total creator fees collected in BNB (ETH)
    uint256 public totalVolumeXToken;          // Total volume in X Token (pre + post grad)
    uint256 public totalVolumeBNB;             // Total volume in BNB (post-grad only)

    // 24h tracking
    uint256 public volume24h;
    uint256 public priceChangePercent24h;
    uint256 public price24hAgo;
    uint256 public lastUpdate24h;

    // Metadata (optimized: store as IPFS/URL hashes to save gas)
    bytes32 public descriptionHash;
    bytes32 public imageHash;
    bytes32 public socialHash;

    // Custom Errors
    error InvalidAmount();
    error TokenGraduated();
    error InsufficientSupply();
    error SlippageExceeded();
    error InsufficientTokens();
    error InsufficientXToken();
    error TransferFailed();
    error OnlyCreator();
    error TargetNotReached();
    error AlreadyGraduated();
    error OnlyFactory();
    error NotGraduated();
    error NoFees();
    error InvalidThreshold();
    error InvalidFee();

    // Events
    event Buy(address indexed user, uint256 xTokenIn, uint256 tokensOut, uint256 feeXToken);
    event Sell(address indexed user, uint256 tokensIn, uint256 xTokenOut, uint256 feeXToken);
    event Graduated(address indexed token, uint256 xTokenRaised, uint256 timestamp, bool isAutoGraduation);
    event LeftoverTokensBurned(uint256 amount, address indexed burnedBy, bool isAutoBurn);
    event XTokenFeesSwappedToETH(uint256 xTokenAmount, uint256 ethReceived, uint256 threshold);
    event ProjectTokenFeesSwappedToETH(uint256 projectTokenAmount, uint256 ethReceived, uint256 threshold);
    event SwapThresholdUpdated(uint256 newThresholdBps, bool isPostGrad);
    event XTokenAddressUpdated(address indexed oldAddress, address indexed newAddress);
    event FeeUpdated(uint8 feeType, uint256 newFee);

    // Structs for complex return data
    struct BondingCurveDetails {
        uint256 currentPriceXToken;
        uint256 virtualXTokenReserve;
        uint256 realXTokenReserve;
        uint256 tokenSupply;
        uint256 graduationThresholdXToken;
        uint256 progressToGraduation;
    }

    // Struct to reduce stack depth in sell() function
    struct SellCalculation {
        uint256 xTokenOutGross;
        uint256 feeXToken;
        uint256 xTokenToUser;
    }

    // Struct for constructor parameters to avoid stack too deep
    struct BondingCurveParams {
        uint256 targetXTokens;
        uint256 virtualXTokens;
        uint256 virtualProjectTokens;
        uint256 maxSupply;
        uint256 initialSupply;
        uint256 uniswapSupply;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        bytes32 _descriptionHash,
        bytes32 _imageHash,
        bytes32 _socialHash,
        address _creator,
        address _factory,
        address _graduationHelper,
        address _xTokenAddress,
        address _uniswapV2Router,
        address _weth,
        BondingCurveParams memory _params,
        uint256 _creatorAllocationBps
    ) ERC20(_name, _symbol) Ownable(_creator) {
        creator = _creator;
        creatorFeeRecipient = _creator;  // Default to creator, can be changed later
        factory = _factory;
        GRADUATION_HELPER = _graduationHelper;
        descriptionHash = _descriptionHash;
        imageHash = _imageHash;
        socialHash = _socialHash;
        X_TOKEN_ADDRESS = _xTokenAddress;
        UNISWAP_V2_ROUTER = _uniswapV2Router;
        WETH = _weth;
        isXTokenWETH = (_xTokenAddress == _weth);
        targetXTokens = _params.targetXTokens;

        // Set bonding curve parameters
        VIRTUAL_X_TOKENS = _params.virtualXTokens;
        VIRTUAL_PROJECT_TOKENS = _params.virtualProjectTokens;
        MAX_SUPPLY = _params.maxSupply;
        INITIAL_SUPPLY = _params.initialSupply;
        UNISWAP_SUPPLY = _params.uniswapSupply;

        // Mint all tokens to contract (bonding curve + liquidity)
        _mint(address(this), INITIAL_SUPPLY + UNISWAP_SUPPLY);

        // Send creator allocation if specified (0-5%)
        if (_creatorAllocationBps > 0) {
            uint256 creatorAllocation = (_params.initialSupply * _creatorAllocationBps) / 10000;
            _transfer(address(this), _creator, creatorAllocation);
        }

        // Initialize 24h tracking
        lastUpdate24h = block.timestamp;
        price24hAgo = getCurrentPriceXToken();
    }

    /**
     * @notice Get current token price in X Tokens (bonding curve)
     */
    function getCurrentPriceXToken() public view returns (uint256) {
        uint256 currentSupply = totalSupply() - balanceOf(address(this));
        uint256 remainingTokens = VIRTUAL_PROJECT_TOKENS > currentSupply ? VIRTUAL_PROJECT_TOKENS - currentSupply : 1e18;
        if (remainingTokens == 0) remainingTokens = 1e18;
        return ((VIRTUAL_X_TOKENS + poolBalanceXToken) * 1e18) / remainingTokens;
    }

    /**
     * @notice Get market cap in X Tokens (bonding curve)
     */
    function getMarketCapXToken() public view returns (uint256) {
        uint256 circulatingSupply = totalSupply() - balanceOf(address(this));
        return getCurrentPriceXToken() * circulatingSupply / 1e18;
    }

    /**
     * @notice Get actual Uniswap price and market cap (post-graduation only)
     * @return priceXToken Price per token in X Tokens (0 if not graduated)
     * @return marketCapXToken Market cap based on Uniswap price (0 if not graduated)
     */
    function getUniswapMetrics() external view returns (uint256 priceXToken, uint256 marketCapXToken) {
        if (!isGraduated || uniswapV2Pair == address(0)) return (0, 0);

        IUniswapV2Pair pair = IUniswapV2Pair(uniswapV2Pair);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();

        uint256 xTokenReserve = pair.token0() == X_TOKEN_ADDRESS ? reserve0 : reserve1;
        uint256 projectTokenReserve = pair.token0() == X_TOKEN_ADDRESS ? reserve1 : reserve0;

        if (projectTokenReserve == 0) return (0, 0);

        priceXToken = (xTokenReserve * 1e18) / projectTokenReserve;
        uint256 circulatingSupply = totalSupply() - balanceOf(address(this));
        marketCapXToken = (priceXToken * circulatingSupply) / 1e18;
    }

    /**
     * @notice Get graduation progress percentage
     */
    function getGraduationProgress() public view returns (uint256) {
        return poolBalanceXToken >= targetXTokens ? 100 : (poolBalanceXToken * 100) / targetXTokens;
    }

    /**
     * @notice Get dynamic swap threshold based on pool size or supply
     * @return minSwapAmount Minimum tokens before triggering swap to ETH
     */
    function getSwapThreshold() public view returns (uint256 minSwapAmount) {
        if (isGraduated) {
            // Post-graduation: Based on circulating supply
            uint256 circulatingSupply = totalSupply() - balanceOf(address(this));
            minSwapAmount = (circulatingSupply * swapThresholdPostGradBps) / 10000;
        } else {
            // Pre-graduation: Based on target (FIXED amount, doesn't grow with pool)
            minSwapAmount = (targetXTokens * swapThresholdBps) / 10000;
        }

        // Set minimum floor to avoid gas waste on tiny swaps
        if (minSwapAmount < MIN_FLOOR) {
            minSwapAmount = MIN_FLOOR;
        }

        return minSwapAmount;
    }

    /**
     * @notice Preview buy calculation
     */
    function previewBuy(uint256 xTokenAmount) external view returns (uint256 tokensOut, uint256 feeXToken) {
        // Calculate total pre-grad fee (factory + creator)
        uint256 totalPreGradFee = preGradFactoryFee + preGradCreatorFee;
        feeXToken = (xTokenAmount * totalPreGradFee) / FEE_DENOMINATOR;
        uint256 xTokenAfterFee = xTokenAmount - feeXToken;

        // Constant product bonding curve with FIXED virtual reserves
        uint256 currentSupply = totalSupply() - balanceOf(address(this));
        uint256 remainingTokens = VIRTUAL_PROJECT_TOKENS - currentSupply;

        // Use FIXED virtual reserves (no adjustment based on progress)
        uint256 k = (VIRTUAL_X_TOKENS + poolBalanceXToken) * remainingTokens;
        uint256 newRemainingTokens = k / (VIRTUAL_X_TOKENS + poolBalanceXToken + xTokenAfterFee);
        tokensOut = remainingTokens - newRemainingTokens;

        return (tokensOut, feeXToken);
    }

    /**
     * @notice Preview sell calculation
     */
    function previewSell(uint256 tokenAmount) external view returns (uint256 xTokenOut, uint256 feeXToken) {
        require(tokenAmount > 0, "Invalid token amount");
        require(!isGraduated, "Token graduated");

        uint256 currentSupply = totalSupply() - balanceOf(address(this));
        require(currentSupply >= tokenAmount, "Cannot sell more than circulating supply");

        uint256 xTokenOutGross = _calculateSellXToken(currentSupply, tokenAmount);
        // Calculate total pre-grad fee (factory + creator)
        uint256 totalPreGradFee = preGradFactoryFee + preGradCreatorFee;
        feeXToken = (xTokenOutGross * totalPreGradFee) / FEE_DENOMINATOR;
        xTokenOut = xTokenOutGross - feeXToken;

        return (xTokenOut, feeXToken);
    }

    /**
     * @notice Buy tokens with native ETH
     */
    function buy(uint256 minTokensOut) external payable nonReentrant {
        _buyFor(msg.sender, msg.value, minTokensOut);
    }

    /**
     * @notice Buy tokens for a specific recipient (used by factory for initial buy)
     */
    function buyFor(address recipient, uint256 minTokensOut) external payable nonReentrant {
        require(msg.sender == factory, "Only factory can buy for others");
        _buyFor(recipient, msg.value, minTokensOut);
    }

    /**
     * @notice Internal buy logic - accepts native ETH
     */
    function _buyFor(address recipient, uint256 ethAmount, uint256 minTokensOut) internal {
        require(!isGraduated, "Token graduated");
        require(ethAmount > 0, "No ETH sent");
        require(recipient != address(0), "Invalid recipient");

        // Wrap ETH to WETH for internal accounting and Uniswap compatibility
        IWETH(X_TOKEN_ADDRESS).deposit{value: ethAmount}();

        // Calculate pre-grad fees (split between factory and creator)
        uint256 totalPreGradFee = preGradFactoryFee + preGradCreatorFee;
        uint256 feeXToken = (ethAmount * totalPreGradFee) / FEE_DENOMINATOR;
        uint256 factoryFeeXToken = (ethAmount * preGradFactoryFee) / FEE_DENOMINATOR;
        uint256 creatorFeeXToken = feeXToken - factoryFeeXToken;
        uint256 xTokenAfterFee = ethAmount - feeXToken;

        // Constant product bonding curve
        uint256 currentSupply = totalSupply() - balanceOf(address(this));
        uint256 remainingTokens = VIRTUAL_PROJECT_TOKENS - currentSupply;
        uint256 availableTokens = balanceOf(address(this));

        // Use FIXED virtual reserves for symmetric buy/sell pricing
        uint256 k = (VIRTUAL_X_TOKENS + poolBalanceXToken) * remainingTokens;
        uint256 newRemainingTokens = k / (VIRTUAL_X_TOKENS + poolBalanceXToken + xTokenAfterFee);
        uint256 tokensOut = remainingTokens - newRemainingTokens;

        require(tokensOut >= minTokensOut, "Slippage exceeded");
        require(tokensOut <= balanceOf(address(this)), "Not enough tokens in curve");

        // Update state
        poolBalanceXToken += xTokenAfterFee;
        pendingFactoryFeesXToken += factoryFeeXToken;
        pendingCreatorFeesXToken += creatorFeeXToken;
        totalTx++;

        // Update 24h tracking
        _update24hMetrics(xTokenAfterFee);

        // Transfer tokens to recipient
        _transfer(address(this), recipient, tokensOut);

        emit Buy(recipient, ethAmount, tokensOut, feeXToken);

        // Auto-swap fees to ETH if threshold reached
        _autoSwapXTokenFeesToETH();

        // Check for auto-graduation
        if (poolBalanceXToken >= targetXTokens && !isGraduated) {
            _graduateToUniswap(true);
        }
    }

    /**
     * @notice Calculate X Token out for sell operation (FIXED: symmetric pricing)
     */
    function _calculateSellXToken(uint256 currentSupply, uint256 tokenAmount) internal view returns (uint256 xTokenOut) {
        uint256 currentRemainingTokens = VIRTUAL_PROJECT_TOKENS - currentSupply;
        uint256 newRemainingTokens = currentRemainingTokens + tokenAmount;

        // Use FIXED virtual reserves for symmetric pricing (same as buy)
        uint256 k = (VIRTUAL_X_TOKENS + poolBalanceXToken) * currentRemainingTokens;
        uint256 newPoolXToken = (k / newRemainingTokens);

        // Calculate how much poolBalanceXToken decreases
        if (newPoolXToken > VIRTUAL_X_TOKENS) {
            newPoolXToken = newPoolXToken - VIRTUAL_X_TOKENS;
        } else {
            newPoolXToken = 0;
        }

        xTokenOut = poolBalanceXToken > newPoolXToken ? poolBalanceXToken - newPoolXToken : 0;

        if (xTokenOut > poolBalanceXToken) {
            xTokenOut = poolBalanceXToken;
        }

        return xTokenOut;
    }

    /**
     * @notice Calculate all sell amounts
     */
    function _calculateSellAmounts(uint256 tokenAmount) internal view returns (SellCalculation memory calc) {
        uint256 currentSupply = totalSupply() - balanceOf(address(this));
        calc.xTokenOutGross = _calculateSellXToken(currentSupply, tokenAmount);
        // Calculate total pre-grad fee (factory + creator)
        uint256 totalPreGradFee = preGradFactoryFee + preGradCreatorFee;
        calc.feeXToken = (calc.xTokenOutGross * totalPreGradFee) / FEE_DENOMINATOR;
        calc.xTokenToUser = calc.xTokenOutGross - calc.feeXToken;
        return calc;
    }

    /**
     * @notice Sell tokens for X Token (1% fee in X Token)
     */
    function sell(uint256 tokenAmount, uint256 minXTokenOut) external nonReentrant {
        require(!isGraduated, "Token graduated");
        require(tokenAmount > 0, "Invalid amount");
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient tokens");

        uint256 currentSupply = totalSupply() - balanceOf(address(this));
        require(currentSupply >= tokenAmount, "Cannot sell more than circulating supply");

        SellCalculation memory calc = _calculateSellAmounts(tokenAmount);

        require(calc.xTokenToUser >= minXTokenOut, "Slippage exceeded");
        require(calc.xTokenOutGross <= poolBalanceXToken, "Insufficient X Token in pool");

        // Split fees between factory and creator
        uint256 factoryFeeXToken = (calc.xTokenOutGross * preGradFactoryFee) / FEE_DENOMINATOR;
        uint256 creatorFeeXToken = calc.feeXToken - factoryFeeXToken;

        // Update state
        poolBalanceXToken -= calc.xTokenOutGross;
        pendingFactoryFeesXToken += factoryFeeXToken;
        pendingCreatorFeesXToken += creatorFeeXToken;
        totalTx++;

        // Update 24h tracking
        _update24hMetrics(calc.xTokenOutGross);

        // Transfer tokens back to contract
        _transfer(msg.sender, address(this), tokenAmount);

        // Send ETH to user (after fee)
        // If X Token is WETH, unwrap and send native ETH
        if (isXTokenWETH) {
            IWETH(X_TOKEN_ADDRESS).withdraw(calc.xTokenToUser);
            (bool success, ) = msg.sender.call{value: calc.xTokenToUser}("");
            require(success, "ETH transfer failed");
        } else {
            // For custom tokens, transfer directly
            IERC20(X_TOKEN_ADDRESS).safeTransfer(msg.sender, calc.xTokenToUser);
        }

        emit Sell(msg.sender, tokenAmount, calc.xTokenToUser, calc.feeXToken);

        // Auto-swap fees to ETH if threshold reached
        _autoSwapXTokenFeesToETH();
    }

    /**
     * @notice Auto-swap accumulated X Token fees to ETH (percentage-based threshold)
     */
    function _autoSwapXTokenFeesToETH() internal {
        _swapXTokenFeesToETH(false);
    }

    /**
     * @notice Internal swap logic with optional threshold bypass
     */
    function _swapXTokenFeesToETH(bool forceSwap) internal {
        uint256 totalXTokenFees = pendingFactoryFeesXToken + pendingCreatorFeesXToken;

        if (totalXTokenFees == 0) return;

        // Get dynamic threshold
        uint256 threshold = getSwapThreshold();

        // Only swap if threshold reached (unless forced)
        if (!forceSwap && totalXTokenFees < threshold) {
            return;
        }

        // If X Token IS WETH, no swap needed - just move from XToken accounting to ETH accounting
        if (isXTokenWETH) {
            // Distribute fees directly (WETH = ETH equivalent)
            if (pendingCreatorFeesXToken > 0) {
                uint256 factoryProportion = (pendingFactoryFeesXToken * 1e18) / totalXTokenFees;
                uint256 factoryETH = (totalXTokenFees * factoryProportion) / 1e18;
                uint256 creatorETH = totalXTokenFees - factoryETH;

                pendingFactoryFees += factoryETH;
                pendingCreatorFees += creatorETH;
            } else {
                pendingFactoryFees += totalXTokenFees;
            }

            // Reset counters
            pendingFactoryFeesXToken = 0;
            pendingCreatorFeesXToken = 0;

            emit XTokenFeesSwappedToETH(totalXTokenFees, totalXTokenFees, threshold);
            return;
        }

        // Otherwise do normal swap for custom tokens
        // Approve Uniswap router
        IERC20(X_TOKEN_ADDRESS).approve(UNISWAP_V2_ROUTER, totalXTokenFees);

        // Setup swap path: X Token → WETH
        address[] memory path = new address[](2);
        path[0] = X_TOKEN_ADDRESS;
        path[1] = WETH;

        // Get ETH balance before swap
        uint256 ethBefore = address(this).balance;

        // Swap X Tokens for ETH
        try IUniswapV2RouterSwap(UNISWAP_V2_ROUTER).swapExactTokensForETHSupportingFeeOnTransferTokens(
            totalXTokenFees,
            0,
            path,
            address(this),
            block.timestamp + 300
        ) {
            uint256 ethReceived = address(this).balance - ethBefore;

            // Distribute ETH
            if (pendingCreatorFeesXToken > 0) {
                uint256 factoryProportion = (pendingFactoryFeesXToken * 1e18) / totalXTokenFees;
                uint256 factoryETH = (ethReceived * factoryProportion) / 1e18;
                uint256 creatorETH = ethReceived - factoryETH;

                pendingFactoryFees += factoryETH;
                pendingCreatorFees += creatorETH;
            } else {
                pendingFactoryFees += ethReceived;
            }

            // Reset counters
            pendingFactoryFeesXToken = 0;
            pendingCreatorFeesXToken = 0;

            emit XTokenFeesSwappedToETH(totalXTokenFees, ethReceived, threshold);
        } catch {
            // Swap failed, fees remain as X Tokens
        }
    }

    /**
     * @notice Manual swap of accumulated X Token fees to ETH (bypasses threshold)
     */
    function swapFeesToETH() external nonReentrant {
        uint256 totalXTokenFees = pendingFactoryFeesXToken + pendingCreatorFeesXToken;
        require(totalXTokenFees > 0, "No fees to swap");
        _swapXTokenFeesToETH(true); // Force swap, bypass threshold
    }

    /**
     * @notice Manual graduation (only creator, only if target reached)
     */
    function manualGraduate() external {
        require(msg.sender == creator, "Only creator can manually graduate");
        require(poolBalanceXToken >= targetXTokens, "Target not reached");
        require(!isGraduated, "Already graduated");
        _graduateToUniswap(false);
    }

    /**
     * @notice Internal graduation logic
     */
    function _graduateToUniswap(bool isAuto) internal {
        isGraduated = true;

        // Automatically burn leftover tokens from bonding curve
        _burnLeftoverTokensOnGraduation();

        // Notify factory to handle Uniswap graduation
        IFactory(factory).graduateToken();

        emit Graduated(address(this), poolBalanceXToken, block.timestamp, isAuto);
    }

    /**
     * @notice Called by factory to complete graduation
     */
    function graduateToken() external {
        require(msg.sender == factory, "Only factory");
    }

    /**
     * @notice Transfer liquidity to Uniswap (called by factory)
     * @dev Factory will transfer tokenAmount to helper, keeping the 1% migration fee
     */
    function transferLiquidityToUniswap() external returns (uint256 xTokenAmount, uint256 tokenAmount) {
        require(msg.sender == factory, "Only factory");
        require(isGraduated, "Not graduated");

        xTokenAmount = poolBalanceXToken;

        // Calculate 1% token migration fee (kept by factory)
        uint256 tokenMigrationFee = (UNISWAP_SUPPLY * 100) / 10000; // 1%
        tokenAmount = UNISWAP_SUPPLY - tokenMigrationFee; // 99% goes to Uniswap

        // Transfer X Tokens to factory
        IERC20(X_TOKEN_ADDRESS).safeTransfer(factory, xTokenAmount);

        // Transfer all tokens to factory (100%)
        _transfer(address(this), factory, UNISWAP_SUPPLY);

        // Return only 99% as tokenAmount - factory will transfer this to helper
        // Factory keeps the remaining 1% as migration fee
        return (xTokenAmount, tokenAmount);
    }

    /**
     * @notice Set Uniswap pair address (called by factory)
     */
    function setUniswapPair(address _pair) external {
        require(msg.sender == factory, "Only factory");
        uniswapV2Pair = _pair;
    }

    /**
     * @notice Burn leftover tokens from bonding curve
     */
    function burnLeftoverTokens() external nonReentrant {
        require(isGraduated, "Not graduated yet");
        require(msg.sender == creator || msg.sender == factory, "Only creator or factory");

        uint256 contractBalance = balanceOf(address(this));
        uint256 leftoverTokens = contractBalance > UNISWAP_SUPPLY
            ? contractBalance - UNISWAP_SUPPLY
            : contractBalance;

        require(leftoverTokens > 0, "No leftover tokens to burn");
        _burn(address(this), leftoverTokens);

        emit LeftoverTokensBurned(leftoverTokens, msg.sender, false);
    }

    /**
     * @notice Internal function to automatically burn leftover tokens on graduation
     */
    function _burnLeftoverTokensOnGraduation() internal {
        uint256 contractBalance = balanceOf(address(this));

        if (contractBalance > UNISWAP_SUPPLY) {
            uint256 leftoverTokens = contractBalance - UNISWAP_SUPPLY;
            _burn(address(this), leftoverTokens);
            emit LeftoverTokensBurned(leftoverTokens, address(this), true);
        }
    }

    /**
     * @notice Internal function to update 24h metrics
     */
    function _update24hMetrics(uint256 volumeXToken) internal {
        if (block.timestamp >= lastUpdate24h + 24 hours) {
            volume24h = 0;
            price24hAgo = getCurrentPriceXToken();
            lastUpdate24h = block.timestamp;
        }

        volume24h += volumeXToken;
        totalVolumeXToken += volumeXToken;  // Track lifetime volume in X Token

        uint256 currentPrice = getCurrentPriceXToken();
        if (price24hAgo > 0) {
            if (currentPrice > price24hAgo) {
                priceChangePercent24h = ((currentPrice - price24hAgo) * 10000) / price24hAgo;
            } else {
                priceChangePercent24h = ((price24hAgo - currentPrice) * 10000) / price24hAgo;
            }
        }
    }

    /**
     * @notice Get bonding curve details
     */
    function getBondingCurve() external view returns (BondingCurveDetails memory) {
        uint256 currentSupply = totalSupply() - balanceOf(address(this));

        return BondingCurveDetails({
            currentPriceXToken: getCurrentPriceXToken(),
            virtualXTokenReserve: VIRTUAL_X_TOKENS,
            realXTokenReserve: poolBalanceXToken,
            tokenSupply: currentSupply,
            graduationThresholdXToken: targetXTokens,
            progressToGraduation: getGraduationProgress()
        });
    }

    // ============ FEE COLLECTION ============

    function collectFactoryFees() external {
        require(msg.sender == factory || msg.sender == owner(), "Only factory or owner");
        uint256 fees = pendingFactoryFees;
        require(fees > 0, "No fees to collect");

        pendingFactoryFees = 0;
        totalFactoryFeesCollected += fees;  // Track lifetime total

        // If X Token is WETH and we don't have enough ETH, unwrap WETH
        if (isXTokenWETH && address(this).balance < fees) {
            uint256 needed = fees - address(this).balance;
            IWETH(X_TOKEN_ADDRESS).withdraw(needed);
        }

        (bool success, ) = factory.call{value: fees}("");
        require(success, "Fee transfer failed");
    }

    function collectCreatorFees() external {
        require(msg.sender == creator, "Only creator");
        uint256 fees = pendingCreatorFees;
        require(fees > 0, "No fees to collect");

        pendingCreatorFees = 0;
        totalCreatorFeesCollected += fees;  // Track lifetime total

        // If X Token is WETH and we don't have enough ETH, unwrap WETH
        if (isXTokenWETH && address(this).balance < fees) {
            uint256 needed = fees - address(this).balance;
            IWETH(X_TOKEN_ADDRESS).withdraw(needed);
        }

        (bool success, ) = creatorFeeRecipient.call{value: fees}("");
        require(success, "Fee transfer failed");
    }

    function getFees() external view returns (
        uint256 factoryFeesETH,
        uint256 creatorFeesETH,
        uint256 factoryFeesXToken,
        uint256 creatorFeesXToken,
        uint256 factoryFeesTokens,
        uint256 creatorFeesTokens
    ) {
        return (
            pendingFactoryFees,
            pendingCreatorFees,
            pendingFactoryFeesXToken,
            pendingCreatorFeesXToken,
            pendingFactoryTokenFees,
            pendingCreatorTokenFees
        );
    }

    // ============ POST-GRADUATION FEES (0.4% split: 0.2% factory + 0.2% creator) ============

    function _applyPostGradFee(address from, address to, uint256 amount) internal returns (uint256) {
        // Skip fees for contract, factory, creator operations
        if (from == address(this) || to == address(this) ||
            from == factory || to == factory ||
            from == creator || to == creator) {
            return amount;
        }

        // Detect Uniswap trading
        bool isUniswapTrade = (from == uniswapV2Pair || to == uniswapV2Pair);

        uint256 totalPostGradFee = postGradFactoryFee + postGradCreatorFee;
        if (isUniswapTrade && totalPostGradFee > 0) {
            uint256 factoryTokens = (amount * postGradFactoryFee) / FEE_DENOMINATOR;
            uint256 creatorTokens = (amount * postGradCreatorFee) / FEE_DENOMINATOR;
            uint256 feeTokens = factoryTokens + creatorTokens;

            if (feeTokens > 0) {
                _transfer(from, address(this), feeTokens);

                pendingFactoryTokenFees += factoryTokens;
                pendingCreatorTokenFees += creatorTokens;

                _autoSwapProjectTokenFeesToETH();

                return amount - feeTokens;
            }
        }

        return amount;
    }

    /**
     * @notice Auto-swap PROJECT token fees to ETH via X Token
     */
    function _autoSwapProjectTokenFeesToETH() internal {
        uint256 totalTokenFees = pendingFactoryTokenFees + pendingCreatorTokenFees;

        uint256 threshold = getSwapThreshold();

        if (totalTokenFees < threshold) {
            return;
        }

        uint256 factoryProportion = (pendingFactoryTokenFees * 1e18) / totalTokenFees;

        _approve(address(this), UNISWAP_V2_ROUTER, totalTokenFees);

        // Dynamic swap path based on whether X Token is WETH
        address[] memory path;
        if (isXTokenWETH) {
            // Direct path: PROJECT Token → WETH (1 hop)
            path = new address[](2);
            path[0] = address(this);
            path[1] = WETH;
        } else {
            // Custom token path: PROJECT Token → X Token → WETH (2 hops)
            path = new address[](3);
            path[0] = address(this);
            path[1] = X_TOKEN_ADDRESS;
            path[2] = WETH;
        }

        uint256 ethBefore = address(this).balance;

        try IUniswapV2RouterSwap(UNISWAP_V2_ROUTER).swapExactTokensForETHSupportingFeeOnTransferTokens(
            totalTokenFees,
            0,
            path,
            address(this),
            block.timestamp + 300
        ) {
            uint256 ethReceived = address(this).balance - ethBefore;

            uint256 factoryETH = (ethReceived * factoryProportion) / 1e18;
            uint256 creatorETH = ethReceived - factoryETH;

            pendingFactoryFees += factoryETH;
            pendingCreatorFees += creatorETH;

            pendingFactoryTokenFees = 0;
            pendingCreatorTokenFees = 0;

            emit ProjectTokenFeesSwappedToETH(totalTokenFees, ethReceived, threshold);
        } catch {
            // Swap failed
        }
    }

    /**
     * @notice Manual swap of PROJECT token fees to ETH
     */
    function swapProjectFeesToETH() external nonReentrant {
        require(isGraduated, "Not graduated");
        uint256 totalTokenFees = pendingFactoryTokenFees + pendingCreatorTokenFees;
        require(totalTokenFees > 0, "No token fees to swap");

        _autoSwapProjectTokenFeesToETH();
    }

    /**
     * @notice Update swap thresholds (only factory)
     */
    function setSwapThreshold(uint256 newThresholdBps, bool isPostGrad) external {
        require(msg.sender == factory, "Only factory");
        require(newThresholdBps >= 10 && newThresholdBps <= 1000, "Invalid threshold");

        if (isPostGrad) {
            swapThresholdPostGradBps = newThresholdBps;
        } else {
            swapThresholdBps = newThresholdBps;
        }

        emit SwapThresholdUpdated(newThresholdBps, isPostGrad);
    }

    function setFee(uint8 feeType, uint256 newFeeBps) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (newFeeBps > 200) revert InvalidFee();
        if (feeType == 0) {
            preGradFactoryFee = newFeeBps;
        } else if (feeType == 1) {
            preGradCreatorFee = newFeeBps;
        } else if (feeType == 2) {
            postGradFactoryFee = newFeeBps;
        } else if (feeType == 3) {
            postGradCreatorFee = newFeeBps;
        }
        emit FeeUpdated(feeType, newFeeBps);
    }

    /**
     * @notice Factory can update creator's post-graduation fee (decrease only, max 2%)
     */
    function setCreatorFee(uint256 newFeeBps) external {
        require(msg.sender == factory, "Only factory");
        require(newFeeBps <= 200, "Fee too high");
        require(newFeeBps <= postGradCreatorFee, "Can only decrease fee");
        postGradCreatorFee = newFeeBps;
        emit FeeUpdated(2, newFeeBps);
    }

    /**
     * @notice Factory can change where creator fees are sent
     */
    function setCreatorFeeRecipient(address newRecipient) external {
        require(msg.sender == factory, "Only factory");
        require(newRecipient != address(0), "Invalid address");
        creatorFeeRecipient = newRecipient;
    }

    /**
     * @notice Update X Token address (only factory or GraduationHelper)
     * @param newXTokenAddress New X Token address
     */
    function updateXTokenAddress(address newXTokenAddress) external {
        require(
            msg.sender == factory ||
            msg.sender == GRADUATION_HELPER,
            "Only factory or GraduationHelper"
        );
        require(newXTokenAddress != address(0), "Invalid address");

        address oldAddress = X_TOKEN_ADDRESS;
        X_TOKEN_ADDRESS = newXTokenAddress;

        emit XTokenAddressUpdated(oldAddress, newXTokenAddress);
    }

    // Override transfer function to apply post-grad fees
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (isGraduated) {
            uint256 finalAmount = _applyPostGradFee(msg.sender, to, amount);
            _transfer(msg.sender, to, finalAmount);
        } else {
            _transfer(msg.sender, to, amount);
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);

        if (isGraduated) {
            uint256 finalAmount = _applyPostGradFee(from, to, amount);
            _transfer(from, to, finalAmount);
        } else {
            _transfer(from, to, amount);
        }
        return true;
    }

    // Emergency functions
    receive() external payable {}

    function emergencyWithdraw() external {
        require(msg.sender == factory, "Only factory");
        require(isGraduated, "Only after graduation");

        // If X Token is WETH, unwrap any remaining WETH balance
        if (isXTokenWETH) {
            uint256 wethBalance = IERC20(X_TOKEN_ADDRESS).balanceOf(address(this));
            if (wethBalance > 0) {
                IWETH(X_TOKEN_ADDRESS).withdraw(wethBalance);
            }
        }

        (bool success, ) = factory.call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }

    // Block ownership transfer to prevent security issues
    function transferOwnership(address newOwner) public override onlyOwner {
        revert("Ownership transfer is disabled");
    }

    function renounceOwnership() public override onlyOwner {
        revert("Ownership renunciation is disabled");
    }
}
